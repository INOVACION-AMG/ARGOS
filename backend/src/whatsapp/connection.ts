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
// 3 min = 36-90 vueltas normales del ciclo de polling (2-5s por vuelta, ver
// INTERVALO_SIN_MENSAJES_MS/INTERVALO_TRAS_ERROR_MS en greenApi.ts) -- de
// sobra para no confundir una vuelta lenta puntual con un ciclo realmente
// colgado.
const UMBRAL_ATASCO_SEGUNDOS = 180;
const NUMERO_JEFE = '573022939548';

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
    // Incidente real del 2026-09-22: durante una falla de red prolongada
    // hacia Green API, cada intento de getState() (más abajo) también
    // fallaba, así que este chequeo nunca detectaba un estado "no conectado"
    // -- solo registraba el error y seguía esperando a la próxima vuelta. El
    // ciclo de polling quedó mudo 5 horas sin que nada lo reiniciara, y pm2
    // lo veía "online" todo el tiempo porque el proceso seguía vivo. Este
    // chequeo es independiente de si Green API responde o no: se fija en si
    // el propio ciclo de polling sigue dando vueltas.
    const segundosMudo = client!.segundosDesdeUltimoLatido();
    if (segundosMudo > UMBRAL_ATASCO_SEGUNDOS) {
      console.error(`Watchdog: el ciclo de polling lleva ${segundosMudo}s sin dar señales de vida. Reiniciando el proceso...`);
      await avisarAtascoAlJefe(segundosMudo);
      process.exit(1);
    }

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

// Best-effort: si esto falla (ej. la misma falla de red que causó el atasco),
// no debe impedir el reinicio -- por eso va con su propio timeout corto y
// nunca deja que un error se propague hacia afuera.
async function avisarAtascoAlJefe(segundosMudo: number): Promise<void> {
  try {
    const minutos = Math.round(segundosMudo / 60);
    const aviso = client!.sendMessage(
      `${NUMERO_JEFE}@c.us`,
      `Argos: me quedé sin responder unos ${minutos} min por una falla de conexión. Me estoy reiniciando solo, ya debería volver a funcionar. Si algo sigue raro, avísale a Mario.`
    );
    await Promise.race([
      aviso,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
    ]);
  } catch (err) {
    console.error('Watchdog: no se pudo avisar del reinicio por atasco:', err);
  }
}
