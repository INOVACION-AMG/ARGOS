import 'dotenv/config';
import { obtenerCatalogoAmg } from '../src/modules/productos-amg/service';
import { interpretarMensajeClienteAmg } from '../src/ai/ordersAmg';

async function resolver(mensaje: string) {
  const catalogo = await obtenerCatalogoAmg(mensaje);
  const interpretacion = await interpretarMensajeClienteAmg(mensaje, catalogo);
  return { catalogo, interpretacion };
}

async function main() {
  console.log('--- Mensaje 1: pedido generico ---');
  const m1 = 'necesito una camara turret';
  const r1 = await resolver(m1);
  console.log('tipo:', r1.interpretacion.tipo);
  console.log('respuesta:', r1.interpretacion.respuesta);
  console.log('candidatos catalogo:', r1.catalogo.length);

  if (r1.interpretacion.tipo !== 'consulta' || !r1.interpretacion.respuesta) {
    console.log('\n(La IA no dio una consulta con pregunta aclaratoria esta vez -- prueba con otro mensaje.)');
    return;
  }

  console.log('\n--- Mensaje 2: el cliente responde eligiendo una opcion, CON el contexto reconstruido ---');
  const contexto = `Mensaje anterior del cliente: "${m1}"\nRespuesta que le diste (con opciones/pregunta): "${r1.interpretacion.respuesta}"\nNueva respuesta del cliente: "la primera"`;
  const r2 = await resolver(contexto);
  console.log('tipo:', r2.interpretacion.tipo);
  console.log('items resueltos:', JSON.stringify(r2.interpretacion.items, null, 2));
  console.log('respuesta:', r2.interpretacion.respuesta);

  console.log('\n--- Mensaje 2 (comparacion): el mismo "la primera" SIN contexto, como pasaba antes del fix ---');
  const r2sinContexto = await resolver('la primera');
  console.log('tipo:', r2sinContexto.interpretacion.tipo);
  console.log('items resueltos:', JSON.stringify(r2sinContexto.interpretacion.items, null, 2));
  console.log('respuesta:', r2sinContexto.interpretacion.respuesta);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
