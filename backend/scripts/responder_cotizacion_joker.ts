import 'dotenv/config';

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
if (!idInstance || !apiTokenInstance) throw new Error('Faltan credenciales de Green API en .env');

const NUMERO_JEFE = '573022939548';
const CHAT_ID = `${NUMERO_JEFE}@c.us`;

const MENSAJE =
  'LÍDER, perdón la demora -- este mensaje se quedó atascado porque mi chat con usted quedó bloqueado por un tema técnico de anoche (ya lo arreglé). Aquí está lo que entendí de la cotización para JOKER, LÍDER:\n\n' +
  '- Mto preventivo CCTV: $365.000\n' +
  '- Suministro switch de 24 puertos: $2.467.000\n' +
  '- Adecuación rack y configuración CCTV: $180.000\n' +
  '- Mantenimiento detección de incendios (~50 dispositivos + panel): $1.200.000\n' +
  '- Suministro e instalación luces show room cálida: $250.000\n' +
  '- Mano de obra instalación luces (cableado, punto eléctrico e interruptor): $180.000\n' +
  '- Revisión, mantenimiento y pruebas sistema eléctrico (tomas y puestos de trabajo): $800.000\n' +
  '- Suministro sistema de videoconferencia (cámara + centro de audio, Panacast): $10.500.000\n' +
  '- División en vidrio templado oficina sala de juntas (6 ventanas 60cm frosted medio cuerpo, 3 rieles): $8.000.000\n' +
  '- Adecuación puerta cocina, guía inferior, con instalación: $230.000\n' +
  '- Trabajo de pintura (mano de obra y suministros): $9.000.000\n\n' +
  'Subtotal: $33.172.000\n\n' +
  'Como me dijo que estos valores son únicos para este proyecto, los voy a dejar así (no los voy a guardar en el catálogo para futuras cotizaciones).\n\n' +
  'Para dejarla lista solo me falta: ¿esta va como cuenta de cobro (sin IVA) o factura electrónica (con IVA 19%)? Con eso se la genero completa.';

async function main() {
  const resp = await fetch(`https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: CHAT_ID, message: MENSAJE }),
  });
  if (!resp.ok) throw new Error(`Green API sendMessage falló: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  console.log('Mensaje enviado:', data);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
