import { db } from '../../db/client';

export interface ItemHistorialCliente {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface ClienteFinalHistorial {
  nombre: string;
  items: ItemHistorialCliente[];
  ultimaCotizacion: Date | null;
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabrasClave(texto: string): string[] {
  const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'para', 'con', 'conjunto', 'residencial', 'edificio', 'ph', 'p', 'h']);
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length >= 3 && !VACIAS.has(p));
}

// El jefe casi nunca escribe el nombre completo tal como quedó guardado la
// primera vez (ej. dice "Altavista" y el nombre guardado es "ALTAVISTA DEL
// PORTAL CONJUNTO RESIDENCIAL") -- se busca por coincidencia exacta primero
// y si no, por mejor solapamiento de palabras clave (excluyendo relleno tipo
// "conjunto"/"residencial"/"edificio", que no distingue nada entre clientes).
export async function buscarClienteFinal(nombreLibre: string): Promise<ClienteFinalHistorial | null> {
  const normalizado = normalizar(nombreLibre);
  if (!normalizado) return null;

  const exacto = await db.clienteFinalAmg.findUnique({ where: { nombreNormalizado: normalizado } });
  if (exacto) {
    return { nombre: exacto.nombre, items: exacto.items as unknown as ItemHistorialCliente[], ultimaCotizacion: exacto.ultimaCotizacion };
  }

  const palabrasBuscadas = palabrasClave(nombreLibre);
  if (palabrasBuscadas.length === 0) return null;

  const todos = await db.clienteFinalAmg.findMany();
  let mejor: (typeof todos)[number] | null = null;
  let mejorScore = 0;

  for (const c of todos) {
    const palabrasCliente = new Set(palabrasClave(c.nombre));
    let score = 0;
    for (const p of palabrasBuscadas) if (palabrasCliente.has(p)) score++;
    if (score > mejorScore) {
      mejorScore = score;
      mejor = c;
    }
  }

  // Exige al menos la mitad de las palabras clave del nombre buscado para
  // evitar falsos positivos entre dos conjuntos distintos que comparten una
  // sola palabra suelta (ej. "Terrazas del Norte" vs "Terrazas del Sol").
  if (!mejor || mejorScore < Math.ceil(palabrasBuscadas.length / 2)) return null;

  return { nombre: mejor.nombre, items: mejor.items as unknown as ItemHistorialCliente[], ultimaCotizacion: mejor.ultimaCotizacion };
}

// Se llama al finalizar cada cotización real (ver finalizarCotizacion en
// messageRouter.ts) para que la próxima vez que se cotice a este mismo
// cliente final, Argos pueda mostrar lo que se le cotizó la última vez.
// Reemplaza el historial anterior por el de la cotización más reciente (no
// se acumula infinitamente -- lo último es lo más útil como referencia).
export async function guardarHistorialCliente(nombreLibre: string, items: ItemHistorialCliente[]): Promise<void> {
  const normalizado = normalizar(nombreLibre);
  if (!normalizado || items.length === 0) return;

  await db.clienteFinalAmg.upsert({
    where: { nombreNormalizado: normalizado },
    update: { items: items as any, ultimaCotizacion: new Date() },
    create: { nombreNormalizado: normalizado, nombre: nombreLibre.trim(), items: items as any, ultimaCotizacion: new Date() },
  });
}
