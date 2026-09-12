import { EventEmitter } from 'events';
import { conReintento } from '../utils/reintentar';

// Reemplaza whatsapp-web.js/Puppeteer (2026-09-08): ese enfoque controlaba un
// Chrome real, y con dos cuentas distintas la conexión quedaba "viva" para
// enviar pero dejaba de recibir en silencio, sin ningún evento de error --
// un fallo del propio proceso local, no de la cuenta de WhatsApp. Green API
// es un servicio administrado: en vez de mantener un navegador nosotros,
// solo hacemos peticiones HTTP simples y preguntamos "¿hay mensajes
// nuevos?" cada pocos segundos (receiveNotification). Si una petición falla,
// se reintenta sola en el siguiente ciclo -- no hay estado local de por
// medio que se pueda quedar zombie.

const API_BASE = 'https://api.green-api.com';

function credenciales(): { idInstance: string; apiTokenInstance: string } {
  const idInstance = process.env.GREEN_API_ID_INSTANCE;
  const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
  if (!idInstance || !apiTokenInstance) {
    throw new Error('Faltan GREEN_API_ID_INSTANCE / GREEN_API_TOKEN_INSTANCE en el .env');
  }
  return { idInstance, apiTokenInstance };
}

function urlMetodo(metodo: string): string {
  const { idInstance, apiTokenInstance } = credenciales();
  return `${API_BASE}/waInstance${idInstance}/${metodo}/${apiTokenInstance}`;
}

function soloDigitos(valor: string): string {
  return valor.replace(/[^\d]/g, '');
}

export class MessageMedia {
  constructor(
    public mimetype: string,
    public data: string,
    public filename?: string,
  ) {}
}

export interface Contact {
  pushname?: string;
  name?: string;
  number?: string;
}

export interface Message {
  fromMe: boolean;
  to: string;
  from: string;
  id: { _serialized: string };
  body: string;
  type: string;
  hasMedia: boolean;
  downloadMedia(): Promise<{ data: string; mimetype: string }>;
  getContact(): Promise<Contact>;
}

interface SentMessage {
  id: { _serialized: string };
}

async function fetchJson(metodo: string): Promise<any> {
  const resp = await fetch(urlMetodo(metodo));
  if (!resp.ok) throw new Error(`Green API ${metodo} falló: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function enviarTexto(chatId: string, mensaje: string): Promise<SentMessage> {
  const resp = await fetch(urlMetodo('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message: mensaje }),
  });
  if (!resp.ok) throw new Error(`Green API sendMessage falló: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return { id: { _serialized: data.idMessage } };
}

async function enviarArchivo(chatId: string, media: MessageMedia): Promise<SentMessage> {
  const form = new FormData();
  form.append('chatId', chatId);
  const buffer = Buffer.from(media.data, 'base64');
  form.append('file', new Blob([buffer], { type: media.mimetype }), media.filename ?? 'archivo');

  const resp = await fetch(urlMetodo('sendFileByUpload'), { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`Green API sendFileByUpload falló: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return { id: { _serialized: data.idMessage } };
}

// Green API usa la MISMA llave "fileMessageData" para todo adjunto (imagen,
// audio, video, documento) -- no una llave distinta por tipo
// (imageMessageData, audioMessageData, etc., que es lo que asumía este
// código antes y nunca existió en la respuesta real). Bug real: hacía que
// downloadMedia() fallara siempre con "este mensaje no tiene un archivo
// adjunto descargable" para CUALQUIER adjunto, detectado primero con audios
// pero afectaba fotos igual (nunca se había probado una foto real).
// Fuente: https://green-api.com/en/docs/api/receiving/notifications-format/incoming-message/ImageMessage/
// Un adjunto de WhatsApp se descarga completo en memoria y se manda en
// base64 a Whisper o a Claude -- sin límites, un archivo enorme (o un
// servidor lento) podía agotar memoria, quedarse colgado indefinidamente, o
// disparar el costo de la llamada a la IA. mimeType también viene tal cual
// lo reporta Green API, sin validar -- se restringe a lo que el bot
// realmente sabe procesar (imágenes y audio).
const MEDIA_TIMEOUT_MS = 20_000;
const MEDIA_MAX_BYTES = 20 * 1024 * 1024; // 20MB, generoso para un audio/foto de WhatsApp

async function descargarMediaConLimites(downloadUrl: string, mimetype: string): Promise<{ data: string; mimetype: string }> {
  if (!/^(image|audio)\//.test(mimetype) && mimetype !== 'application/ogg') {
    throw new Error(`Tipo de archivo adjunto no soportado: ${mimetype}`);
  }

  return conReintento(() => descargarUnaVez(downloadUrl, mimetype), { intentos: 3, esperaMs: 500 });
}

async function descargarUnaVez(downloadUrl: string, mimetype: string): Promise<{ data: string; mimetype: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);

  try {
    const resp = await fetch(downloadUrl, { signal: controller.signal });
    if (!resp.ok) throw new Error(`No se pudo descargar el archivo adjunto: ${resp.status}`);

    const largoDeclarado = Number(resp.headers.get('content-length') ?? 0);
    if (largoDeclarado > MEDIA_MAX_BYTES) {
      throw new Error(`El archivo adjunto es demasiado grande (${largoDeclarado} bytes).`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.byteLength > MEDIA_MAX_BYTES) {
      throw new Error(`El archivo adjunto es demasiado grande (${buffer.byteLength} bytes).`);
    }

    return { data: buffer.toString('base64'), mimetype };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Descarga del archivo adjunto agotó el tiempo de espera (${MEDIA_TIMEOUT_MS}ms).`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function extraerMedia(messageData: any): { downloadUrl: string; mimetype: string } | undefined {
  const datos = messageData?.fileMessageData;
  if (!datos?.downloadUrl) return undefined;
  return { downloadUrl: datos.downloadUrl, mimetype: datos.mimeType ?? 'application/octet-stream' };
}

function mapearNotificacionAMensaje(body: any, ownWid: string): Message | undefined {
  // Solo nos interesan mensajes genuinamente entrantes -- los que el propio
  // bot manda no generan este tipo de notificación (van por
  // outgoingMessageWebhook, que dejamos apagado), así que no hace falta
  // protección contra eco propio como con whatsapp-web.js.
  if (body?.typeWebhook !== 'incomingMessageReceived') return undefined;

  const chatId: string = body.senderData?.chatId;
  if (!chatId || chatId.endsWith('@g.us')) return undefined;

  const messageData = body.messageData ?? {};
  const tipoMensaje: string = messageData.typeMessage ?? '';

  let type = 'chat';
  let texto = '';
  let hasMedia = false;
  let media: { downloadUrl: string; mimetype: string } | undefined;

  switch (tipoMensaje) {
    case 'textMessage':
      texto = messageData.textMessageData?.textMessage ?? '';
      break;
    case 'extendedTextMessage':
      texto = messageData.extendedTextMessageData?.text ?? '';
      break;
    case 'imageMessage':
      type = 'image';
      hasMedia = true;
      texto = messageData.imageMessageData?.caption ?? '';
      media = extraerMedia(messageData);
      break;
    case 'audioMessage':
      type = 'audio';
      hasMedia = true;
      media = extraerMedia(messageData);
      break;
    case 'documentMessage':
      type = 'document';
      hasMedia = true;
      texto = messageData.documentMessageData?.caption ?? '';
      media = extraerMedia(messageData);
      break;
    default:
      // video, sticker, ubicación, etc. -- no manejados, se ignoran igual
      // que antes con whatsapp-web.js.
      return undefined;
  }

  const senderName: string | undefined = body.senderData?.senderContactName || body.senderData?.senderName || undefined;

  return {
    fromMe: false,
    from: chatId,
    to: ownWid,
    id: { _serialized: body.idMessage },
    body: texto,
    type,
    hasMedia,
    async downloadMedia() {
      if (!media) throw new Error('Este mensaje no tiene un archivo adjunto descargable.');
      return descargarMediaConLimites(media.downloadUrl, media.mimetype);
    },
    async getContact() {
      return { pushname: senderName, name: senderName, number: soloDigitos(chatId) };
    },
  };
}

const INTERVALO_SIN_MENSAJES_MS = 2_000;
const INTERVALO_TRAS_ERROR_MS = 5_000;

export class Client extends EventEmitter {
  info!: { wid: { _serialized: string } };
  private detenido = false;

  async initialize(): Promise<void> {
    const settings = await this.asegurarRecepcionActiva();
    this.info = { wid: { _serialized: settings.wid } };

    this.iniciarPolling();
  }

  // La instancia puede crearse (o quedar, tras un reinicio de fábrica del
  // lado de Green API) con `incomingWebhook` en "no" -- en ese estado la
  // instancia ni siquiera encola los mensajes entrantes, así que
  // receiveNotification nunca devuelve nada aunque WhatsApp sí los reciba.
  // Pasó exactamente esto el 2026-09-08 al crear la instancia por primera
  // vez. Se verifica y corrige solo al arrancar para no depender de acordarse
  // de revisarlo a mano cada vez.
  private async asegurarRecepcionActiva(): Promise<any> {
    const settings = await fetchJson('getSettings');
    if (settings.incomingWebhook === 'yes') return settings;

    console.log('Green API: incomingWebhook estaba apagado (no se reciben mensajes así). Activando y reiniciando la instancia...');
    const resp = await fetch(urlMetodo('setSettings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incomingWebhook: 'yes' }),
    });
    if (!resp.ok) throw new Error(`Green API setSettings falló: ${resp.status} ${await resp.text()}`);

    await fetch(urlMetodo('reboot'));
    await this.esperarAutorizado();
    return fetchJson('getSettings');
  }

  private async esperarAutorizado(intentos = 20): Promise<void> {
    for (let i = 0; i < intentos; i++) {
      const estado = await this.getState();
      if (estado === 'CONNECTED') return;
      await new Promise((r) => setTimeout(r, 3_000));
    }
    throw new Error('Green API: la instancia no volvió a autorizarse después de reiniciarla.');
  }

  async getState(): Promise<string> {
    const data = await fetchJson('getStateInstance');
    return data.stateInstance === 'authorized' ? 'CONNECTED' : data.stateInstance;
  }

  async sendMessage(chatId: string, content: string | MessageMedia): Promise<SentMessage> {
    if (content instanceof MessageMedia) return enviarArchivo(chatId, content);
    return enviarTexto(chatId, content);
  }

  stop(): void {
    this.detenido = true;
  }

  private async iniciarPolling(): Promise<void> {
    while (!this.detenido) {
      let notificacion: any;
      try {
        notificacion = await fetchJson('receiveNotification');
      } catch (err) {
        console.error('Green API: error consultando mensajes nuevos:', err);
        await new Promise((r) => setTimeout(r, INTERVALO_TRAS_ERROR_MS));
        continue;
      }

      if (!notificacion) {
        await new Promise((r) => setTimeout(r, INTERVALO_SIN_MENSAJES_MS));
        continue;
      }

      try {
        const msg = mapearNotificacionAMensaje(notificacion.body, this.info.wid._serialized);
        if (msg) this.emit('message_create', msg);
      } catch (err) {
        console.error('Green API: error procesando una notificación entrante:', err);
      } finally {
        try {
          await fetch(`${urlMetodo('deleteNotification')}/${notificacion.receiptId}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Green API: no se pudo borrar una notificación ya procesada:', err);
        }
      }
    }
  }
}
