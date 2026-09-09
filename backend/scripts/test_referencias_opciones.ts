import 'dotenv/config';
import { obtenerCatalogoAmg } from '../src/modules/productos-amg/service';
import { interpretarMensajeClienteAmg } from '../src/ai/ordersAmg';

async function resolver(mensaje: string) {
  const catalogo = await obtenerCatalogoAmg(mensaje);
  const interpretacion = await interpretarMensajeClienteAmg(mensaje, catalogo);
  return { catalogo, interpretacion };
}

// Mismo texto real que reportó el jefe (respuesta de Argos con lista en
// guiones, sin numerar).
const RESPUESTA_ARGOS =
  `Con gusto! Tenemos varias opciones de cámaras tipo turret, por ejemplo:\n\n` +
  `- Turret TurboHD 2MP, lente 2.8mm, interior: $54.825\n` +
  `- Turret TurboHD 2MP, imagen a color 24/7, exterior IP67: $121.775\n` +
  `- Turret TurboHD 5MP, IR 20mts: $91.850\n` +
  `- Turret IP 4MP PoE, imagen a color 24/7: $359.775\n` +
  `- Turret TurboHD 4K, luz blanca 40mts: $492.475\n\n` +
  `¿Podrías indicarnos si la necesitas para interior o exterior, y si prefieres resolución 2MP, 4MP o 5MP? Así te recomendamos la más adecuada y te confirmamos el precio exacto.`;

const MENSAJE_ORIGINAL = 'necesito una camara turret';

const VARIANTES = [
  'la primera',
  'la primera opcion',
  'la segunda',
  'la ultima',
  'cual me recomiendas',
  'la de 91850',
  'la mas barata',
  'la de 4mp',
  'esa misma, dale',
  'ninguna de esas, tienes otra mas economica?',
];

async function main() {
  for (const variante of VARIANTES) {
    const contexto =
      `Mensaje anterior del cliente: "${MENSAJE_ORIGINAL}"\n` +
      `Respuesta que le diste (con opciones/pregunta): "${RESPUESTA_ARGOS}"\n` +
      `Nueva respuesta del cliente: "${variante}"`;

    const r = await resolver(contexto);
    console.log(`\n=== "${variante}" ===`);
    console.log('tipo:', r.interpretacion.tipo);
    if (r.interpretacion.items.length > 0) {
      for (const it of r.interpretacion.items) {
        const prod = r.catalogo.find((p) => p.id === it.productoId);
        console.log(`  -> ITEM RESUELTO: ${prod?.nombre ?? it.productoId} x${it.cantidad} ($${prod?.precio})`);
      }
    }
    if (r.interpretacion.respuesta) console.log('  respuesta:', r.interpretacion.respuesta);
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
