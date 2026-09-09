import 'dotenv/config';
import * as fs from 'fs';
import { obtenerCatalogoAmg } from '../src/modules/productos-amg/service';

const RUTA_JSON = 'C:/Users/usuario/Desktop/CLIENTES/DOCUMENTOS/AMG/cotizaciones_consolidado.json';
const RUTA_SALIDA = 'C:/Users/usuario/Desktop/CLIENTES/DOCUMENTOS/AMG/CRUCE_CATALOGO_HISTORICO.txt';

interface ItemHistorico {
  descripcion: string;
  cantidad?: number;
  valorUnitario?: number;
  valorTotal?: number;
  categoria?: string;
}

interface Cotizacion {
  cliente: string;
  fecha: string;
  numero: string;
  archivo: string;
  valorTotal?: number;
  items: ItemHistorico[];
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palabras de relleno que aparecen en casi TODOS los items de mano de obra
// ("mano de obra por instalacion de/x metro/punto...") -- si se dejan en el
// puntaje, cualquier item de mano de obra calza falsamente con cualquier
// otro (mismo bug ya visto en buscarProductoManoObraSimilar). Se excluyen
// del cálculo de similitud, igual que alli.
const PALABRAS_IRRELEVANTES = new Set([
  'mano', 'obra', 'por', 'instalacion', 'instalación', 'punto', 'metro', 'metros', 'servicio', 'del', 'las', 'los', 'para',
]);

function palabras(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(' ')
      .filter((p) => p.length >= 3 && !PALABRAS_IRRELEVANTES.has(p)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

async function main() {
  const cotizaciones: Cotizacion[] = JSON.parse(fs.readFileSync(RUTA_JSON, 'utf-8'));

  // Deduplicar items por descripcion normalizada, quedandonos con el precio
  // del registro con fecha mas reciente (si hay fecha) o el ultimo visto.
  const unicos = new Map<
    string,
    { descripcion: string; precioHistorico: number | undefined; fecha: string | undefined; clientes: Set<string>; apariciones: number }
  >();

  for (const cot of cotizaciones) {
    for (const item of cot.items) {
      const key = normalizar(item.descripcion);
      if (!key) continue;
      const existente = unicos.get(key);
      if (!existente) {
        unicos.set(key, {
          descripcion: item.descripcion,
          precioHistorico: item.valorUnitario,
          fecha: cot.fecha,
          clientes: new Set([cot.cliente]),
          apariciones: 1,
        });
      } else {
        existente.apariciones++;
        existente.clientes.add(cot.cliente);
        if (cot.fecha && (!existente.fecha || cot.fecha > existente.fecha)) {
          existente.fecha = cot.fecha;
          existente.precioHistorico = item.valorUnitario;
        }
      }
    }
  }

  console.log(`Items unicos a cruzar contra el catalogo real: ${unicos.size}`);

  const resultados: {
    descripcion: string;
    precioHistorico: number | undefined;
    apariciones: number;
    clientes: string[];
    mejorMatch: { nombre: string; sku: string; precio: number; id: string; unidad: string } | null;
    similitud: number;
    diferenciaPrecioPct: number | null;
  }[] = [];

  let procesados = 0;
  for (const u of unicos.values()) {
    procesados++;
    if (procesados % 20 === 0) console.log(`  ...${procesados}/${unicos.size}`);

    let candidatos: Awaited<ReturnType<typeof obtenerCatalogoAmg>> = [];
    try {
      candidatos = await obtenerCatalogoAmg(u.descripcion);
    } catch (err) {
      console.error(`Error buscando "${u.descripcion}":`, (err as Error).message);
    }

    const palabrasDesc = palabras(u.descripcion);
    let mejor: { nombre: string; sku: string; precio: number; id: string; unidad: string } | null = null;
    let mejorScore = 0;
    for (const c of candidatos) {
      const score = jaccard(palabrasDesc, palabras(c.nombre));
      if (score > mejorScore) {
        mejorScore = score;
        mejor = { nombre: c.nombre, sku: c.sku, precio: c.precio, id: c.id, unidad: c.unidad };
      }
    }

    // Sin palabras clave utiles (todo era relleno, ej. "MANO DE OBRA" solo) --
    // no hay como comparar de forma confiable, se descarta el match.
    if (palabrasDesc.size === 0) {
      mejor = null;
      mejorScore = 0;
    }

    let diferenciaPrecioPct: number | null = null;
    if (mejor && u.precioHistorico && mejor.precio > 0) {
      diferenciaPrecioPct = Math.round(((mejor.precio - u.precioHistorico) / u.precioHistorico) * 1000) / 10;
    }

    resultados.push({
      descripcion: u.descripcion,
      precioHistorico: u.precioHistorico,
      apariciones: u.apariciones,
      clientes: Array.from(u.clientes),
      mejorMatch: mejorScore >= 0.34 ? mejor : null,
      similitud: mejorScore,
      diferenciaPrecioPct,
    });
  }

  const conMatch = resultados.filter((r) => r.mejorMatch);
  const sinMatch = resultados.filter((r) => !r.mejorMatch);
  const conDiferenciaGrande = conMatch.filter((r) => r.diferenciaPrecioPct !== null && Math.abs(r.diferenciaPrecioPct) >= 20);

  const money = (v: number | undefined | null) => (v === undefined || v === null ? '?' : `$${Math.round(v).toLocaleString('es-CO')}`);

  const lineas: string[] = [];
  lineas.push('CRUCE DE COTIZACIONES HISTORICAS CONTRA EL CATALOGO REAL DE AMG (Supabase)');
  lineas.push('Este archivo es de REVISION -- no se modifico ningun precio real del catalogo.');
  lineas.push('='.repeat(90));
  lineas.push('');
  lineas.push(`Total productos/servicios unicos analizados: ${resultados.length}`);
  lineas.push(`  - Encontrados en el catalogo real (similitud >= 34%): ${conMatch.length}`);
  lineas.push(`  - NO encontrados en el catalogo real: ${sinMatch.length}`);
  lineas.push(`  - Encontrados pero con diferencia de precio >= 20%: ${conDiferenciaGrande.length}`);
  lineas.push('');
  lineas.push('='.repeat(90));
  lineas.push('SECCION 1: DIFERENCIAS DE PRECIO GRANDES (revisar con prioridad)');
  lineas.push('='.repeat(90));
  lineas.push('');
  for (const r of conDiferenciaGrande.sort((a, b) => Math.abs(b.diferenciaPrecioPct!) - Math.abs(a.diferenciaPrecioPct!))) {
    lineas.push(`- "${r.descripcion}"`);
    lineas.push(`    Precio en cotizacion historica (${r.apariciones}x, clientes: ${r.clientes.slice(0, 3).join(', ')}${r.clientes.length > 3 ? '...' : ''}): ${money(r.precioHistorico)}`);
    lineas.push(`    Precio actual en catalogo: ${money(r.mejorMatch!.precio)} / ${r.mejorMatch!.unidad} (SKU ${r.mejorMatch!.sku}) -- "${r.mejorMatch!.nombre}"`);
    lineas.push(`    Diferencia: ${r.diferenciaPrecioPct! > 0 ? '+' : ''}${r.diferenciaPrecioPct}%`);
    lineas.push('');
  }

  lineas.push('='.repeat(90));
  lineas.push('SECCION 2: NO ENCONTRADOS EN EL CATALOGO REAL (candidatos a agregar)');
  lineas.push('='.repeat(90));
  lineas.push('');
  for (const r of sinMatch.sort((a, b) => b.apariciones - a.apariciones)) {
    lineas.push(`- "${r.descripcion}" -- aparece ${r.apariciones}x (${r.clientes.slice(0, 3).join(', ')}${r.clientes.length > 3 ? '...' : ''}) -- precio historico: ${money(r.precioHistorico)}`);
  }
  lineas.push('');

  lineas.push('='.repeat(90));
  lineas.push('SECCION 3: TODOS LOS MATCHES (referencia completa)');
  lineas.push('='.repeat(90));
  lineas.push('');
  for (const r of conMatch.sort((a, b) => a.descripcion.localeCompare(b.descripcion))) {
    lineas.push(`- "${r.descripcion}" -> "${r.mejorMatch!.nombre}" (SKU ${r.mejorMatch!.sku}) | historico: ${money(r.precioHistorico)} | catalogo: ${money(r.mejorMatch!.precio)}/${r.mejorMatch!.unidad} | similitud: ${Math.round(r.similitud * 100)}%`);
  }

  fs.writeFileSync(RUTA_SALIDA, lineas.join('\n'), 'utf-8');
  fs.writeFileSync(RUTA_SALIDA.replace('.txt', '.json'), JSON.stringify(resultados, null, 2), 'utf-8');
  console.log(`\nListo. Reporte en: ${RUTA_SALIDA}`);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
