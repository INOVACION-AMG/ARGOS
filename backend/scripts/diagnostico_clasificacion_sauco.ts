import 'dotenv/config';
import { obtenerCatalogoAmg } from '../src/modules/productos-amg/service';
import { interpretarMensajeClienteAmg } from '../src/ai/ordersAmg';

const MENSAJE =
  'Argos, ¿me puedes hacer un favor? ¿me puedes ayudar a hacer una cotización de una sirena 12 voltios, 30 vatios, con su punto de mano de obra e instalación para el conjunto residencial Sauco?';

async function main() {
  const catalogo = await obtenerCatalogoAmg(MENSAJE);
  console.log(`Candidatos de catalogo encontrados: ${catalogo.length}`);
  catalogo.slice(0, 15).forEach((p) => console.log(`  - [${p.id}] ${p.nombre} ($${p.precio}/${p.unidad})`));

  const interpretacion = await interpretarMensajeClienteAmg(MENSAJE, catalogo);
  console.log('\ntipo:', interpretacion.tipo);
  console.log('motivo:', interpretacion.motivo);
  console.log('items:', JSON.stringify(interpretacion.items, null, 2));
  console.log('productosNoDisponibles:', interpretacion.productosNoDisponibles);
  console.log('respuesta:', interpretacion.respuesta);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
