import { Client } from './greenApi';
import { registerMessageHandler } from './messageRouter';

// Migrado de whatsapp-web.js a Green API (2026-09-08): whatsapp-web.js
// controlaba un Chrome real vía Puppeteer, y la conexión quedaba "viva" para
// enviar pero dejaba de recibir en silencio, sin ningún evento de error --
// probado con dos cuentas distintas, así que era un fallo del proceso local,
// no de las cuentas. Green API es un servicio administrado: no hay
// navegador ni sesión local que se pueda quedar zombie, solo peticiones HTTP
// simples (ver greenApi.ts). El QR para vincular el número se escanea en el
// panel de Green API (green-api.com), no aquí.

const WATCHDOG_INTERVAL_MS = 60_000;

let client: Client | undefined;

export function getSocket(): Client {
  if (!client) {
    throw new Error('El cliente de WhatsApp aún no está listo. Espera a que conecte.');
  }
  return client;
}

export async function connectWhatsApp(onReady?: () => void): Promise<void> {
  client = new Client();
  registerMessageHandler(client);

  await client.initialize();
  console.log(`WhatsApp conectado correctamente vía Green API (${client.info.wid._serialized}).`);
  onReady?.();

  setInterval(async () => {
    try {
      const estado = await client!.getState();
      if (estado !== 'CONNECTED') {
        console.error(`Watchdog: la instancia de Green API no está autorizada (estado: ${estado}). Reiniciando el proceso...`);
        process.exit(1);
      }
    } catch (err) {
      console.error('Watchdog: no se pudo verificar el estado de la instancia de Green API:', err);
    }
  }, WATCHDOG_INTERVAL_MS);
}
