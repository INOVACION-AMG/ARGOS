import 'dotenv/config';

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
if (!idInstance || !apiTokenInstance) throw new Error('Faltan credenciales de Green API en .env');

const NUMERO_JEFE = '573022939548';
const CHAT_ID = `${NUMERO_JEFE}@c.us`;

const MENSAJE =
  'LÍDER, ya le entiendo bien los audios (el que me mandó ahora se escuchó perfecto) -- pero mientras seguimos entrenando, ' +
  'le funciona mejor si en el audio me dice directamente lo que necesita cotizar, como si me lo estuviera escribiendo, ' +
  'en vez de preguntas sobre mí o cosas generales.\n\n' +
  'Por ejemplo, en vez de "¿ya me entiendes por audios?", dígame algo como:\n' +
  '_"Necesito cotizar 2 cámaras domo 4mp para exterior y un DVR de 8 canales"_\n\n' +
  'Con eso sí le arranco la cotización de una, igual que si me escribiera.';

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
