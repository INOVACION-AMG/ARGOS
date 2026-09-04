import { jidNormalizedUser, type WASocket, type WAMessage } from '@whiskeysockets/baileys';
import { db } from '../db/client';
import { manejarMensajeDeCliente, manejarAudioEntrante, extraerTexto } from './messageRouter';

// Buffer en memoria de mensajes entrantes de chats privados que trae Baileys
// vía `messaging-history.set` al reconectar (incluye lo recibido mientras el
// bot estaba caído). Se llena una sola vez por conexión; los mensajes que
// llegan en vivo después se manejan por el flujo normal de `messages.upsert`.
const bufferPorNumero = new Map<string, WAMessage[]>();

function numeroDeJid(jid: string): string {
  return jid.split('@')[0];
}

function esChatDeClientePrivado(jid: string | null | undefined, ownJid: string): jid is string {
  if (!jid) return false;
  if (jid === 'status@broadcast' || jid.endsWith('@g.us')) return false;
  return jidNormalizedUser(jid) !== ownJid;
}

export function registrarMensajesHistoricos(mensajes: WAMessage[], ownJid: string) {
  for (const msg of mensajes) {
    if (msg.key.fromMe) continue;
    if (!esChatDeClientePrivado(msg.key.remoteJid, ownJid)) continue;

    const tieneContenidoUtil = extraerTexto(msg) ?? msg.message?.audioMessage;
    if (!tieneContenidoUtil) continue;

    const numero = numeroDeJid(msg.key.remoteJid);
    const lista = bufferPorNumero.get(numero) ?? [];
    if (!lista.some((m) => m.key.id === msg.key.id)) {
      lista.push(msg);
      bufferPorNumero.set(numero, lista);
    }
  }
}

function ordenarPorFecha(mensajes: WAMessage[]): WAMessage[] {
  return [...mensajes].sort((a, b) => Number(a.messageTimestamp ?? 0) - Number(b.messageTimestamp ?? 0));
}

// Filtra, dentro del buffer de un número, los mensajes posteriores al último
// que ya procesamos (guardado en Cliente.ultimoMensajeIdProcesado). Si nunca
// habíamos procesado nada de este número, se toma todo el buffer. Si había un
// cursor pero ya no aparece en el buffer (p.ej. quedó fuera de la ventana de
// historial que sincroniza WhatsApp), se asume que ya está al día, para no
// arriesgarse a responder duplicado.
function mensajesPendientesDesdeCursor(mensajes: WAMessage[], cursor: string | null | undefined): WAMessage[] {
  const ordenados = ordenarPorFecha(mensajes);
  if (!cursor) return ordenados;

  const idx = ordenados.findIndex((m) => m.key.id === cursor);
  return idx >= 0 ? ordenados.slice(idx + 1) : [];
}

/**
 * Recorre el buffer de historial reciente y reprocesa, en orden, cada
 * mensaje que un cliente mandó y que el bot nunca llegó a atender (porque
 * estaba caído, o porque el número no estaba aprobado todavía). Reutiliza el
 * mismo flujo que un mensaje en vivo: interpreta el pedido, responde, o
 * escala a un humano si aplica.
 *
 * Sin `numero`, procesa todos los números del buffer (se usa al conectar).
 * Con `numero`, procesa solo ese (se usa justo después de aprobar a un
 * cliente, por comando o por etiqueta).
 */
export async function procesarPendientes(socket: WASocket, ownJid: string, numero?: string) {
  const numeros = numero ? [numero] : Array.from(bufferPorNumero.keys());

  for (const num of numeros) {
    const mensajes = bufferPorNumero.get(num);
    if (!mensajes || mensajes.length === 0) continue;

    const cliente = await db.cliente.findUnique({ where: { numeroWhatsapp: num } });
    const pendientes = mensajesPendientesDesdeCursor(mensajes, cliente?.ultimoMensajeIdProcesado);
    if (pendientes.length === 0) continue;

    const remoteJid = pendientes[0].key.remoteJid!;

    for (const msg of pendientes) {
      try {
        let texto = extraerTexto(msg);
        if (!texto && msg.message?.audioMessage) {
          texto = await manejarAudioEntrante(socket, msg, remoteJid);
        }
        if (!texto) continue;

        await manejarMensajeDeCliente(
          socket,
          ownJid,
          remoteJid,
          msg.pushName ?? undefined,
          texto,
          msg.key.id ?? undefined,
        );
      } catch (err) {
        console.error(`Error procesando mensaje pendiente de ${num}:`, err);
      }
    }
  }
}
