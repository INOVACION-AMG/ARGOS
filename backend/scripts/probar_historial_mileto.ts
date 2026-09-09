import 'dotenv/config';
import { manejarMensajeDeCliente } from '../src/whatsapp/messageRouter';
import { db } from '../src/db/client';

const CHAT_ID = '573000000002@c.us';
const OWN_JID = 'bot-prueba@c.us';

const clienteFalso: any = {
  sendMessage: async (chatId: string, content: any) => {
    if (typeof content === 'string') {
      console.log(`\n[ARGOS -> ${chatId}]:\n${content}`);
    } else {
      console.log(`\n[ARGOS -> ${chatId}]: [adjunto binario, ${content.data?.length ?? '?'} bytes base64]`);
    }
    return { id: 'fake' };
  },
};

async function main() {
  await manejarMensajeDeCliente(clienteFalso, OWN_JID, CHAT_ID, 'PRUEBA CLAUDE (borrar)', 'mandame la cotizacion de mileto', undefined, undefined);
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
