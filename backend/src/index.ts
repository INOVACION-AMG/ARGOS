import 'dotenv/config';
import { connectWhatsApp } from './whatsapp/connection';
import { buildServer } from './api/server';

async function main() {
  const app = buildServer();
  // 127.0.0.1, no 0.0.0.0: los endpoints /admin/* no tienen autenticación
  // propia (asumen que solo son alcanzables desde esta máquina) -- con
  // 0.0.0.0 quedaban expuestos a cualquiera en la misma red local.
  await app.listen({ port: 3000, host: '127.0.0.1' });
  console.log('API escuchando en http://localhost:3000');

  await connectWhatsApp(() => {
    console.log('Listo: el bot ya está enlazado a tu WhatsApp.');
  });
}

main().catch((err) => {
  console.error('Error al iniciar la aplicación:', err);
  process.exit(1);
});
