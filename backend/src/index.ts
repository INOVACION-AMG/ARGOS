import 'dotenv/config';
import { connectWhatsApp, getSocket } from './whatsapp/connection';
import { buildServer } from './api/server';
import { iniciarProgramador } from './jobs/scheduler';

async function main() {
  const app = buildServer();
  await app.listen({ port: 3000, host: '0.0.0.0' });
  console.log('API escuchando en http://localhost:3000');

  await connectWhatsApp(() => {
    console.log('Listo: el bot ya está enlazado a tu WhatsApp.');
    iniciarProgramador(getSocket);
  });
}

main().catch((err) => {
  console.error('Error al iniciar la aplicación:', err);
  process.exit(1);
});
