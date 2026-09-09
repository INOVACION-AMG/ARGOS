import { amgSupabase } from '../../integrations/amgSupabase';
import type { ProductoCatalogoAmg } from '../../ai/ordersAmg';

// Producto agregado a mano por el dueño vía WhatsApp (comando /agregar,
// ver messageRouter.ts) cuando un cliente pide algo que no está en el
// catálogo real. Queda disponible para siempre, igual que uno cargado
// desde la app web -- solo cambia `origen` para saber que no vino de
// Syscom. sku es NOT NULL UNIQUE en la tabla real; se genera uno propio
// porque este producto no tiene referencia de proveedor.
export async function crearProductoAmg(
  nombre: string,
  precio: number,
  tipo: 'suministro' | 'mano_obra' = 'suministro',
): Promise<ProductoCatalogoAmg> {
  const sku = `MANUAL-${Date.now()}`;
  const { data, error } = await amgSupabase()
    .from('productos')
    .insert({ sku, nombre, precio, tipo, unidad: 'UND', activo: true, origen: 'interno' })
    .select('id, sku, nombre, categoria, tipo, unidad, precio')
    .single();

  if (error || !data) throw new Error(`No se pudo agregar el producto al catálogo de AMG: ${error?.message}`);

  return {
    id: data.id,
    sku: data.sku,
    nombre: data.nombre,
    categoria: data.categoria,
    tipo: data.tipo,
    unidad: data.unidad,
    precio: Number(data.precio),
  };
}

export async function actualizarPrecioProductoAmg(id: string, precio: number): Promise<void> {
  const { error } = await amgSupabase().from('productos').update({ precio }).eq('id', id);
  if (error) throw new Error(`No se pudo actualizar el precio del producto: ${error.message}`);
}

// Cuando el jefe da un precio nuevo para un ítem de mano de obra por nombre
// libre (ej. "cable instalado" en vez del nombre exacto del catálogo,
// "MANO DE OBRA METRO DE CABLE INSTALADO"), se busca primero si ya existe un
// producto de mano de obra parecido para actualizarlo, en vez de crear uno
// duplicado cada vez que lo menciona con palabras un poco distintas.
// "mano" y "obra" aparecen en el nombre de TODO producto de mano de obra
// (siempre empiezan con "MANO DE OBRA ...") -- dentro de esta búsqueda, ya
// filtrada a tipo='mano_obra', esas dos palabras no distinguen nada y hacían
// que cualquier término con "obra" (ej. "obra civil") calzara por error con
// el primer producto de mano de obra que apareciera, sin relación real (bug
// real: pisó el precio de "instalación de panel" por buscar "obra civil").
const PALABRAS_IRRELEVANTES_MANO_OBRA = new Set(['mano', 'obra', 'de']);

export async function buscarProductoManoObraSimilar(nombre: string): Promise<ProductoCatalogoAmg | undefined> {
  const palabras = extraerPalabrasClave(nombre).filter((p) => !PALABRAS_IRRELEVANTES_MANO_OBRA.has(p));
  if (palabras.length === 0) return undefined;

  const { data, error } = await amgSupabase()
    .from('productos')
    .select(SELECT_COLUMNAS)
    .eq('activo', true)
    .eq('tipo', 'mano_obra')
    .or(palabras.map((p) => `nombre.ilike.%${p}%`).join(','))
    .limit(20);

  if (error || !data || data.length === 0) return undefined;

  const mejor = data
    .map((p) => ({ producto: p, score: puntuarRelevancia(palabras, p.nombre, p.descripcion) }))
    .sort((a, b) => b.score - a.score)[0];

  // Exige que al menos la mitad de las palabras (sin "mano"/"obra") calcen
  // en el nombre real -- una sola palabra suelta en común ya no basta.
  if (!mejor || mejor.score < Math.ceil(palabras.length / 2) * 10) return undefined;

  return {
    id: mejor.producto.id,
    sku: mejor.producto.sku,
    nombre: mejor.producto.nombre,
    categoria: mejor.producto.categoria,
    tipo: mejor.producto.tipo,
    unidad: mejor.producto.unidad,
    precio: Number(mejor.producto.precio),
  };
}

// El catálogo real de AMG tiene miles de productos activos (Syscom) -- a
// diferencia del catálogo chico de D'Carnes, mandarlo completo a la IA en
// cada mensaje sería lentísimo y carísimo. En vez de eso, se buscan primero
// los candidatos que mencionan las palabras clave del mensaje del cliente
// (mismo criterio de `nombre`/`descripcion` que usa el buscador del
// cotizador web) y solo esos se le pasan a la IA para que elija.
const MAX_CANDIDATOS = 40;

const PALABRAS_VACIAS = new Set([
  'necesito', 'necesitamos', 'quiero', 'queremos', 'requiero', 'para', 'con', 'sin', 'una', 'unas',
  'uno', 'unos', 'el', 'la', 'los', 'las', 'de', 'del', 'al', 'por', 'favor', 'porfa', 'porfavor',
  'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'me', 'te', 'le', 'nos', 'que', 'cual',
  'cuanto', 'cuanta', 'cuantos', 'cuantas', 'cuesta', 'cuestan', 'precio', 'precios', 'tienen',
  'tiene', 'cotizar', 'cotizacion', 'esta', 'este', 'esa', 'ese', 'mi', 'su', 'como', 'donde', 'son',
]);

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

// Solo letras/números tras quitar tildes: además de mejorar el match ILIKE,
// evita que texto del cliente pueda inyectar operadores del mini-lenguaje
// de filtros de PostgREST (comas, paréntesis, etc.) en el `.or(...)`.
function extraerPalabrasClave(texto: string): string[] {
  const palabras = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));

  return Array.from(new Set(palabras)).slice(0, 8);
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '');
}

// Cuenta cuántas palabras clave distintas aparecen en el texto. `nombre`
// pesa mucho más que `descripcion` porque la descripción es en gran parte
// texto de marketing/SEO compartido entre productos no relacionados, y por
// sí sola es un indicador de relevancia muy ruidoso.
function puntuarRelevancia(palabras: string[], nombre: string, descripcion: string | null): number {
  const nombreNorm = normalizar(nombre);
  const descNorm = normalizar(descripcion ?? '');

  let score = 0;
  for (const p of palabras) {
    if (nombreNorm.includes(p)) score += 10;
    else if (descNorm.includes(p)) score += 1;
  }
  return score;
}

type FilaProducto = {
  id: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  tipo: string;
  unidad: string;
  precio: number;
  descripcion: string | null;
};

const SELECT_COLUMNAS = 'id, sku, nombre, categoria, tipo, unidad, precio, descripcion';

// Con palabras sueltas de uso muy común en el catálogo (ej. "canales" matchea
// 232 productos, "domo" 326), un solo OR de todas las palabras contra
// nombre+descripcion puede devolver miles de filas -- si se recorta con un
// límite antes de rankear, la palabra más común se come el cupo y las demás
// quedan afuera aunque el cliente las haya mencionado igual de explícito
// (ej. "cámaras domo" perdiendo "domo" porque "canales" de otro ítem del
// mismo mensaje ya llenó el límite). Por eso se busca cada palabra por
// separado contra `nombre` (con su propio tope), garantizando que todas
// tengan representación, y solo se recurre a `descripcion` completa si el
// resultado por nombre es escaso.
const TOPE_POR_PALABRA = 30;
const TOPE_FALLBACK_DESCRIPCION = 200;
const MIN_RESULTADOS_ANTES_DE_FALLBACK = 10;

// Una consulta de Supabase que se queda colgada (no falla, simplemente
// nunca responde -- visto en producción con mensajes largos de muchas
// palabras clave) bloqueaba toda la búsqueda para siempre, porque
// Promise.allSettled espera a que TODAS las promesas se resuelvan o
// rechacen, y una que nunca hace ninguna de las dos cuelga el resto. Con
// esto, pasado el tiempo límite se trata como una falla más (se recupera
// igual que cualquier otro error de esa palabra) en vez de colgar el
// mensaje del cliente indefinidamente.
const TIMEOUT_CONSULTA_MS = 10_000;

function conTimeout<T>(promesa: Promise<T>, contexto: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tiempo agotado (${TIMEOUT_CONSULTA_MS / 1000}s) buscando en el catálogo AMG: ${contexto}`)), TIMEOUT_CONSULTA_MS),
    ),
  ]);
}

async function buscarPorNombre(palabra: string, limite: number): Promise<FilaProducto[]> {
  const { data, error } = await conTimeout(
    Promise.resolve(
      amgSupabase()
        .from('productos')
        .select(SELECT_COLUMNAS)
        .eq('activo', true)
        // precio > 0: ~5% del catálogo activo (249 de 4992) tiene precio 0 --
        // datos de Syscom sin cargar, no un producto gratis. Un comercial
        // humano lo nota antes de cotizar; el bot no, así que se excluyen de
        // los candidatos: mejor que diga "no lo encontré" a que cotice $0.
        .gt('precio', 0)
        .ilike('nombre', `%${palabra}%`)
        .limit(limite),
    ),
    `nombre ilike "${palabra}"`,
  );

  if (error) throw new Error(`No se pudo buscar en el catálogo de AMG: ${error.message}`);
  return data ?? [];
}

async function buscarPorDescripcion(palabras: string[], limite: number): Promise<FilaProducto[]> {
  const condiciones = palabras.map((p) => `descripcion.ilike.%${p}%`);
  const { data, error } = await conTimeout(
    Promise.resolve(
      amgSupabase()
        .from('productos')
        .select(SELECT_COLUMNAS)
        .eq('activo', true)
        .gt('precio', 0)
        .or(condiciones.join(','))
        .limit(limite),
    ),
    'descripcion (respaldo)',
  );

  if (error) throw new Error(`No se pudo buscar en el catálogo de AMG: ${error.message}`);
  return data ?? [];
}

export async function obtenerCatalogoAmg(mensajeCliente: string): Promise<ProductoCatalogoAmg[]> {
  const palabras = extraerPalabrasClave(mensajeCliente);

  // Sin palabras clave identificables (saludo, agradecimiento, etc.) no hay
  // nada específico que buscar -- se devuelve vacío y la IA responde como
  // 'consulta' sin necesitar catálogo (ver ordersAmg.ts).
  if (palabras.length === 0) return [];

  // Promise.allSettled, no Promise.all: cada palabra es una consulta
  // independiente a Supabase, y una falla puntual (timeout, blip de red,
  // "JWT issued at future" transitorio) no debe tumbar toda la búsqueda --
  // mejor buscar con lo que sí respondió que dejar al cliente sin nada. Si
  // TODAS fallan, sí es un problema real (Supabase caído) y se propaga para
  // que el llamador escale a un humano en vez de responder como si el
  // catálogo estuviera vacío.
  const resultados = await Promise.allSettled(palabras.map((p) => buscarPorNombre(p, TOPE_POR_PALABRA)));

  const vistos = new Map<string, FilaProducto>();
  let fallidas = 0;
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const fila of r.value) vistos.set(fila.id, fila);
    } else {
      fallidas++;
      console.error(`Falló la búsqueda de catálogo AMG para la palabra "${palabras[i]}":`, r.reason);
    }
  });

  if (fallidas === palabras.length) {
    throw new Error('No se pudo buscar en el catálogo de AMG: todas las consultas fallaron.');
  }

  // Si por nombre salió poco (el cliente usó palabras que no aparecen
  // literalmente en los nombres de producto), se amplía con descripcion --
  // más ruidosa, por eso solo se usa como respaldo y no como primera fuente.
  if (vistos.size < MIN_RESULTADOS_ANTES_DE_FALLBACK) {
    try {
      const porDescripcion = await buscarPorDescripcion(palabras, TOPE_FALLBACK_DESCRIPCION);
      for (const fila of porDescripcion) {
        if (!vistos.has(fila.id)) vistos.set(fila.id, fila);
      }
    } catch (err) {
      // Respaldo opcional -- si falla, se sigue con lo que ya se tiene por
      // nombre en vez de tumbar toda la búsqueda por esto.
      console.error('Falló el respaldo de búsqueda por descripción en catálogo AMG:', err);
    }
  }

  return Array.from(vistos.values())
    .map((p) => ({
      producto: {
        id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        categoria: p.categoria,
        tipo: p.tipo,
        unidad: p.unidad,
        precio: Number(p.precio),
      },
      score: puntuarRelevancia(palabras, p.nombre, p.descripcion),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATOS)
    .map((r) => r.producto);
}
