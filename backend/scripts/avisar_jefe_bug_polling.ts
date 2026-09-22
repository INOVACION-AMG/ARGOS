import 'dotenv/config';

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
if (!idInstance || !apiTokenInstance) throw new Error('Faltan credenciales de Green API en .env');

const NUMERO_JEFE = '573022939548';
const CHAT_ID = `${NUMERO_JEFE}@c.us`;

const MENSAJE =
  'Hola LÍDER, soy Argos. Perdón la demora -- tuve un problema técnico esta mañana y no vi sus mensajes a tiempo, ' +
  'ya quedó resuelto. Retomamos: quería cotizar para Almeira un DVR Dahua de 16 canales análogo con inteligencia, ¿cierto? ' +
  'Cuénteme si sigue siendo así o si cambió algo y seguimos con la cotización.';

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
