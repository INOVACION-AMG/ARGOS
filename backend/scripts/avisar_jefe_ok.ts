import 'dotenv/config';

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
if (!idInstance || !apiTokenInstance) throw new Error('Faltan credenciales de Green API en .env');

const NUMERO_JEFE = '573022939548';
const CHAT_ID = `${NUMERO_JEFE}@c.us`;

const MENSAJE =
  'Listo LÍDER, ya quedaron probados y desplegados todos los arreglos de hoy (cancelación a medias, memoria de clientes, ' +
  'reenvío de cotizaciones viejas, y varios detalles más). Cuando quiera, ya puede arrancar una cotización real para ' +
  'seguir ensayándolo. ¡Cualquier cosa rara que note, avíseme!';

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
