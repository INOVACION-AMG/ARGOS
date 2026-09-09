import 'dotenv/config';
import { obtenerCatalogoAmg } from '../src/modules/productos-amg/service';
import { interpretarMensajeClienteAmg } from '../src/ai/ordersAmg';
import { crearCotizacionAmg } from '../src/modules/cotizaciones-amg/service';

async function main() {
  const mensaje = process.argv[2] ?? 'necesito 4 camaras domo 4mp y un dvr de 8 canales';
  console.log('--- Mensaje de prueba ---');
  console.log(mensaje);

  console.log('\n--- 1) Búsqueda en catálogo real (Supabase AMG-LEGION) ---');
  const catalogo = await obtenerCatalogoAmg(mensaje);
  console.log(`Candidatos encontrados: ${catalogo.length}`);
  catalogo.slice(0, 10).forEach((p) => console.log(`  - [${p.id}] ${p.nombre} — $${p.precio} / ${p.unidad}`));

  console.log('\n--- 2) Clasificación con Claude ---');
  const interpretacion = await interpretarMensajeClienteAmg(mensaje, catalogo);
  console.log(JSON.stringify(interpretacion, null, 2));

  if (interpretacion.tipo === 'cotizacion' && interpretacion.items.length > 0) {
    console.log('\n--- 3) Creación de cotización real (cliente de prueba) ---');
    const cot = await crearCotizacionAmg('573000000000-TEST', 'Cliente de prueba (borrar)', interpretacion.items, catalogo);
    console.log(JSON.stringify(cot, null, 2));
  } else {
    console.log('\n--- 3) Se omite creación de cotización (tipo no es "cotizacion" con items) ---');
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
