import 'dotenv/config';
import * as fs from 'fs';
import { db } from '../src/db/client';

const RUTA_JSON = 'C:/Users/usuario/Desktop/CLIENTES/DOCUMENTOS/AMG/cotizaciones_consolidado.json';

interface ItemHistorico {
  descripcion: string;
  cantidad?: number;
  valorUnitario?: number;
}

interface Cotizacion {
  cliente: string;
  fecha?: string;
  notaEspecial?: string;
  items: ItemHistorico[];
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const cotizaciones: Cotizacion[] = JSON.parse(fs.readFileSync(RUTA_JSON, 'utf-8'));

  const porCliente = new Map<string, Cotizacion[]>();
  for (const cot of cotizaciones) {
    if (!cot.cliente) continue;
    // Se salta la plantilla vieja reciclada (no es un cliente real con
    // trabajo reciente, ver nota en Fase 1).
    if (cot.notaEspecial?.includes('plantilla')) continue;
    const key = normalizar(cot.cliente);
    if (!porCliente.has(key)) porCliente.set(key, []);
    porCliente.get(key)!.push(cot);
  }

  let creados = 0;
  for (const [, cots] of porCliente) {
    // Ordena por fecha ascendente (las sin fecha quedan primero) para que al
    // recorrer, el ultimo valor que quede por item sea el mas reciente.
    cots.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));

    const itemsPorDescripcion = new Map<string, { descripcion: string; cantidad: number; precioUnitario: number }>();
    let fechaMasReciente: string | undefined;

    for (const cot of cots) {
      if (cot.fecha) fechaMasReciente = cot.fecha;
      for (const item of cot.items) {
        if (!item.descripcion || item.valorUnitario === undefined) continue;
        itemsPorDescripcion.set(normalizar(item.descripcion), {
          descripcion: item.descripcion,
          cantidad: item.cantidad ?? 1,
          precioUnitario: item.valorUnitario,
        });
      }
    }

    const items = Array.from(itemsPorDescripcion.values());
    if (items.length === 0) continue;

    const nombreOriginal = cots[cots.length - 1].cliente;
    const nombreNormalizado = normalizar(nombreOriginal);

    await db.clienteFinalAmg.upsert({
      where: { nombreNormalizado },
      update: { items: items as any, ultimaCotizacion: fechaMasReciente ? new Date(fechaMasReciente) : undefined },
      create: {
        nombreNormalizado,
        nombre: nombreOriginal,
        items: items as any,
        ultimaCotizacion: fechaMasReciente ? new Date(fechaMasReciente) : undefined,
      },
    });
    creados++;
    console.log(`OK: ${nombreOriginal} -- ${items.length} items (de ${cots.length} cotizacion(es) historicas)`);
  }

  console.log(`\nTotal clientes finales sembrados: ${creados}`);
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
