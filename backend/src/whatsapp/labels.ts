import { ALL_WA_PATCH_NAMES, jidNormalizedUser, type WASocket } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { aprobarClientePorEtiqueta, desaprobarClientePorEtiqueta } from '../modules/clientes/service';
import { procesarPendientes } from './pendientes';

const NOMBRE_ETIQUETA_CLIENTE = (process.env.ETIQUETA_CLIENTE ?? 'Cliente').trim().toLowerCase();

// El ID de la etiqueta "Cliente" solo lo manda WhatsApp por el evento
// `labels.edit`, y no siempre se repite en cada reconexión (solo cuando algo
// de la etiqueta cambia). Sin persistirlo, cada reinicio del proceso perdía
// el mapeo y el bot dejaba de reconocer la etiqueta hasta que alguien la
// editara de nuevo. Se cachea en disco para no depender de que ese evento
// vuelva a ocurrir.
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'labels-cache.json');

function cargarIdEtiquetaCliente(): string | undefined {
  try {
    const contenido = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as Record<string, string>;
    return Object.entries(contenido).find(
      ([, nombre]) => nombre.trim().toLowerCase() === NOMBRE_ETIQUETA_CLIENTE,
    )?.[0];
  } catch {
    return undefined;
  }
}

function guardarEtiqueta(id: string, nombre: string) {
  let contenido: Record<string, string> = {};
  try {
    contenido = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    // primera vez, no existe el archivo todavía
  }
  contenido[id] = nombre;
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(contenido, null, 2));
}

/**
 * Escucha las etiquetas de WhatsApp Business. Cuando el dueño le pone la
 * etiqueta "Cliente" (configurable con ETIQUETA_CLIENTE) a un chat, ese
 * número queda aprobado automáticamente para que el bot le responda.
 */
export function registerLabelHandler(socket: WASocket) {
  let idEtiquetaCliente: string | undefined = cargarIdEtiquetaCliente();

  // Si todavía no conocemos el ID de la etiqueta "Cliente" (primera vez, o
  // el cache se perdió), forzamos una resincronización completa de la
  // colección de etiquetas en vez de esperar pasivamente a que WhatsApp
  // vuelva a mandar un `labels.edit` por su cuenta (puede no pasar en mucho
  // tiempo). Así el bot no queda sordo a la etiqueta tras un reinicio.
  socket.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open' && !idEtiquetaCliente) {
      socket.resyncAppState(ALL_WA_PATCH_NAMES, true).catch((err) => {
        console.error('Error resincronizando etiquetas de WhatsApp:', err);
      });
    }
  });

  socket.ev.on('labels.edit', (label) => {
    if (label.deleted) {
      if (label.id === idEtiquetaCliente) idEtiquetaCliente = undefined;
      return;
    }
    guardarEtiqueta(label.id, label.name);
    if (label.name.trim().toLowerCase() === NOMBRE_ETIQUETA_CLIENTE) {
      idEtiquetaCliente = label.id;
    }
  });

  socket.ev.on('labels.association', async ({ association, type }) => {
    if (association.type !== 'label_jid') return; // solo nos interesan etiquetas de chats, no de mensajes
    if (!idEtiquetaCliente || association.labelId !== idEtiquetaCliente) return;

    const numero = association.chatId.split('@')[0];

    try {
      if (type === 'add') {
        await aprobarClientePorEtiqueta(numero);
        console.log(`Cliente aprobado por etiqueta "${NOMBRE_ETIQUETA_CLIENTE}": ${numero}`);

        const ownJid = jidNormalizedUser(socket.user?.id);
        if (ownJid) {
          await procesarPendientes(socket, ownJid, numero);
        }
      } else {
        await desaprobarClientePorEtiqueta(numero);
        console.log(`Se quitó la etiqueta "${NOMBRE_ETIQUETA_CLIENTE}" a: ${numero}`);
      }
    } catch (err) {
      console.error('Error procesando etiqueta de cliente:', err);
    }
  });
}
