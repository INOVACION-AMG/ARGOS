import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import path from 'path';
import { registerMessageHandler } from './messageRouter';
import { registerLabelHandler } from './labels';
import { registrarMensajesHistoricos, procesarPendientes } from './pendientes';

const AUTH_FOLDER = path.join(__dirname, '..', '..', 'auth_session');
const QR_IMAGE_PATH = path.join(__dirname, '..', '..', 'whatsapp-qr.png');
const logger = pino({ level: 'warn' });

// Baileys tiene su propio keepalive interno, pero se ha visto quedar la
// conexión "zombie": el socket TCP sigue abierto pero deja de recibir
// mensajes de verdad, sin que se dispare 'connection.update' con
// connection:'close' (así que nuestro reintento normal nunca entra). Este
// watchdog prueba activamente la conexión cada cierto tiempo; si no
// responde, se reinicia el proceso completo — pm2 ya está configurado para
// revivirlo al toque con una conexión nueva.
const WATCHDOG_INTERVAL_MS = 60_000;
const WATCHDOG_TIMEOUT_MS = 15_000;

// Este es un fallo distinto y más grave: al conectar, Baileys entra en un
// estado "esperando sincronización" y guarda en un buffer TODOS los eventos
// (mensajes, etiquetas) hasta terminar una resincronización interna propia
// de la librería. Si esa resincronización se cuelga (p.ej. por una consulta
// de red que nunca responde), el buffer nunca se libera y el bot se queda
// sordo para siempre — aunque el ping de bajo nivel (arriba) siga
// funcionando, porque no pasa por ese buffer. Como watchdog normal no lo
// detecta, se verifica aparte: si no llega ningún evento de contenido poco
// después de conectar, se reinicia el proceso.
const SINCRONIZACION_INICIAL_TIMEOUT_MS = 180_000;

async function conexionEstaViva(socket: WASocket): Promise<boolean> {
  try {
    await socket.query(
      {
        tag: 'iq',
        attrs: {
          id: `watchdog-${Date.now()}`,
          to: 's.whatsapp.net',
          type: 'get',
          xmlns: 'w:p',
        },
        content: [{ tag: 'ping', attrs: {} }],
      },
      WATCHDOG_TIMEOUT_MS,
    );
    return true;
  } catch {
    return false;
  }
}

let socket: WASocket | undefined;

export function getSocket(): WASocket {
  if (!socket) {
    throw new Error('El socket de WhatsApp aún no está listo. Espera a que conecte.');
  }
  return socket;
}

export async function connectWhatsApp(onReady?: () => void): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    // Con señal débil, la consulta interna de propiedades de chats
    // (fetchProps/fetchBlocklist/fetchPrivacySettings) nunca completa y deja
    // a Baileys "sordo" aunque el socket siga abierto. El bot no usa nada de
    // eso (mensajes que desaparecen, bloqueados, privacidad), así que se
    // desactiva por completo en vez de solo darle más tiempo.
    fireInitQueries: false,
    defaultQueryTimeoutMs: 120_000,
  });

  socket.ev.on('creds.update', saveCreds);
  registerMessageHandler(socket);
  registerLabelHandler(socket);

  const watchdog = setInterval(async () => {
    if (!socket) return;
    const viva = await conexionEstaViva(socket);
    if (!viva) {
      console.error('Watchdog: la conexión con WhatsApp dejó de responder. Reiniciando el proceso...');
      process.exit(1);
    }
  }, WATCHDOG_INTERVAL_MS);

  let sincronizacionInicialOk = false;
  let sincronizacionTimeout: NodeJS.Timeout | undefined;

  const marcarSincronizacionOk = () => {
    sincronizacionInicialOk = true;
    if (sincronizacionTimeout) clearTimeout(sincronizacionTimeout);
  };

  // Al reconectar, Baileys manda el historial reciente (incluye lo que
  // llegó mientras el bot estaba desconectado). Se acumula hasta que llega
  // el último lote (isLatest) y ahí se revisan pendientes de una vez.
  socket.ev.on('messaging-history.set', ({ messages, isLatest }) => {
    marcarSincronizacionOk();
    const ownJid = jidNormalizedUser(socket?.user?.id);
    if (!ownJid) return;

    registrarMensajesHistoricos(messages, ownJid);

    if (isLatest) {
      procesarPendientes(socket!, ownJid).catch((err) => {
        console.error('Error procesando mensajes pendientes tras reconectar:', err);
      });
    }
  });

  socket.ev.on('messages.upsert', marcarSincronizacionOk);

  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nEscanea este código QR desde WhatsApp > Dispositivos vinculados:\n');
      qrcodeTerminal.generate(qr, { small: true });
      QRCode.toFile(QR_IMAGE_PATH, qr, { width: 400 }).then(() => {
        console.log(`QR también guardado como imagen en: ${QR_IMAGE_PATH}`);
      });
    }

    if (connection === 'open') {
      console.log('WhatsApp conectado correctamente como dispositivo enlazado.');
      onReady?.();

      sincronizacionTimeout = setTimeout(() => {
        if (!sincronizacionInicialOk) {
          console.error(
            `Watchdog: no llegó ningún evento de WhatsApp en ${SINCRONIZACION_INICIAL_TIMEOUT_MS / 1000}s tras conectar ` +
              '(la sincronización interna de Baileys parece haberse colgado). Reiniciando el proceso...',
          );
          process.exit(1);
        }
      }, SINCRONIZACION_INICIAL_TIMEOUT_MS);
    }

    if (connection === 'close') {
      clearInterval(watchdog);
      if (sincronizacionTimeout) clearTimeout(sincronizacionTimeout);

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const debeReconectar = statusCode !== DisconnectReason.loggedOut;

      console.log('Conexión cerrada.', { statusCode, debeReconectar });

      if (debeReconectar) {
        connectWhatsApp(onReady);
      } else {
        console.log('Sesión cerrada desde el celular. Borra la carpeta auth_session y vuelve a escanear el QR.');
      }
    }
  });
}
