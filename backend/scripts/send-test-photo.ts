import 'dotenv/config';
import fs from 'fs';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
import { connectWhatsApp, getSocket } from '../src/whatsapp/connection';

const IMAGE_PATH = process.argv[2];
const CAPTION = process.argv[3] ?? '';

if (!IMAGE_PATH) {
  console.error('Uso: tsx scripts/send-test-photo.ts <ruta-de-la-imagen> ["texto opcional"]');
  process.exit(1);
}

async function main() {
  await new Promise<void>((resolve) => {
    connectWhatsApp(() => resolve());
  });

  const socket = getSocket();
  const ownJid = jidNormalizedUser(socket.user?.id);
  const buffer = fs.readFileSync(IMAGE_PATH);

  await socket.sendMessage(ownJid, { image: buffer, caption: CAPTION });
  console.log(`Foto enviada al chat contigo mismo (${ownJid}). Dejando el proceso corriendo para ver la respuesta del bot...`);
}

main().catch((err) => {
  console.error('Error enviando la foto de prueba:', err);
  process.exit(1);
});
