import {
  downloadMediaMessage,
  jidNormalizedUser,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { extraerPreciosDeImagen } from '../ai/prices';
import { interpretarMensajeCliente } from '../ai/orders';
import { transcribirAudio } from '../ai/transcribe';
import { actualizarPrecios, obtenerCatalogo } from '../modules/productos-precios/service';
import {
  obtenerOCrearCliente,
  aprobarCliente,
  marcarRequiereAtencion,
  marcarMensajeProcesado,
  reanudarBot,
} from '../modules/clientes/service';
import { crearPedido } from '../modules/pedidos/service';
import { procesarPendientes } from './pendientes';

const COMANDO_REANUDAR = '/reanudar';
const COMANDO_APROBAR = '/aprobar';

export function registerMessageHandler(socket: WASocket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        await handleMessage(socket, msg);
      } catch (err) {
        console.error('Error manejando mensaje entrante:', err);
      }
    }
  });
}

async function handleMessage(socket: WASocket, msg: WAMessage) {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) return;

  const ownJid = jidNormalizedUser(socket.user?.id);
  const esChatConMigoMismo = jidNormalizedUser(remoteJid) === ownJid;

  if (esChatConMigoMismo) {
    // En el chat "Tú", solo procesamos lo que el dueño se escribe a sí mismo
    // (ej. la foto de precios, o el comando para aprobar un cliente nuevo).
    if (!msg.key.fromMe) return;

    const textoPropio = extraerTexto(msg)?.trim();
    if (textoPropio?.toLowerCase().startsWith(COMANDO_APROBAR)) {
      const numero = textoPropio.split(/\s+/)[1];
      if (numero) {
        await aprobarCliente(numero);
        await socket.sendMessage(remoteJid, {
          text: `Listo, aprobé a ${numero} como cliente. El bot ya le va a responder normal.`,
        });
        await procesarPendientes(socket, ownJid, numero);
      }
      return;
    }

    // Igual que /aprobar, se puede usar desde este chat con el número, para
    // no tener que ir hasta el chat del cliente a escribirlo (ej. respondiendo
    // directamente a la alerta de "Atención requerida").
    if (textoPropio?.toLowerCase().startsWith(COMANDO_REANUDAR)) {
      const numero = textoPropio.split(/\s+/)[1];
      if (numero) {
        await reanudarBot(numero);
        await socket.sendMessage(remoteJid, {
          text: `Listo, reactivé las respuestas automáticas para ${numero}.`,
        });
      }
      return;
    }

    const imageMessage = msg.message?.imageMessage;
    if (imageMessage) {
      await manejarFotoDePrecios(socket, msg, remoteJid);
    }
    return;
  }

  const textoEscrito = extraerTexto(msg);

  if (msg.key.fromMe) {
    // El dueño escribiéndole directamente a un cliente desde su celular.
    // Solo nos interesa el comando para devolverle el control al bot.
    const comando = textoEscrito?.trim().toLowerCase().replace(/^\//, '');
    if (comando === 'reanudar') {
      await reanudarBot(remoteJid.split('@')[0]);
      await socket.sendMessage(ownJid, {
        text: `Listo, reactivé las respuestas automáticas para ${remoteJid.split('@')[0]}.`,
      });
    }
    return;
  }

  let texto = textoEscrito;

  if (!texto && msg.message?.audioMessage) {
    texto = await manejarAudioEntrante(socket, msg, remoteJid);
    if (!texto) return; // no se pudo transcribir, ya se avisó al cliente
  }

  if (!texto) return;

  await manejarMensajeDeCliente(socket, ownJid, remoteJid, msg.pushName ?? undefined, texto, msg.key.id ?? undefined);
}

export function extraerTexto(msg: WAMessage): string | undefined {
  return msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? undefined;
}

export async function manejarAudioEntrante(
  socket: WASocket,
  msg: WAMessage,
  remoteJid: string,
): Promise<string | undefined> {
  try {
    const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
    const mimetype = msg.message?.audioMessage?.mimetype ?? 'audio/ogg';
    const texto = await transcribirAudio(buffer, mimetype);

    if (!texto) {
      await socket.sendMessage(remoteJid, {
        text: 'No logré entender el audio. ¿Puedes escribirlo o mandarlo de nuevo?',
      });
      return undefined;
    }

    return texto;
  } catch (err) {
    console.error('Error transcribiendo audio:', err);
    await socket.sendMessage(remoteJid, {
      text: 'Tuve un problema escuchando tu audio. ¿Puedes escribirlo, por favor?',
    });
    return undefined;
  }
}

async function manejarFotoDePrecios(socket: WASocket, msg: WAMessage, remoteJid: string) {
  await socket.sendMessage(remoteJid, { text: 'Recibí la foto, dame un momento mientras leo los precios...' });

  try {
    const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
    const mediaType = (msg.message?.imageMessage?.mimetype ?? 'image/jpeg') as
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp';

    const precios = await extraerPreciosDeImagen(buffer.toString('base64'), mediaType);

    if (precios.length === 0) {
      await socket.sendMessage(remoteJid, {
        text: 'No logré leer ningún producto en esa foto. ¿Puedes enviarla de nuevo, más clara o con mejor luz?',
      });
      return;
    }

    const fuente = `flyer_${new Date().toISOString().slice(0, 10)}`;
    const actualizados = await actualizarPrecios(precios, fuente);

    const resumen = actualizados
      .map((p) => `- ${p.nombre}: $${p.precioActual.toString()}/kg`)
      .join('\n');

    await socket.sendMessage(remoteJid, {
      text: `Listo, actualicé ${actualizados.length} precios:\n${resumen}`,
    });
  } catch (err) {
    console.error('Error procesando la foto de precios:', err);
    await socket.sendMessage(remoteJid, {
      text: 'Algo falló leyendo esa foto. ¿Puedes enviarla de nuevo?',
    });
  }
}

export async function manejarMensajeDeCliente(
  socket: WASocket,
  ownJid: string,
  remoteJid: string,
  nombrePerfil: string | undefined,
  texto: string,
  mensajeId?: string,
) {
  const numero = remoteJid.split('@')[0];

  try {
    const { cliente, esNuevo } = await obtenerOCrearCliente(numero, nombrePerfil ?? `Cliente ${numero}`);

    if (!cliente.aprobado) {
      // Número no reconocido como cliente (puede ser familia, amigos, número
      // equivocado, etc.). El bot no le responde nada. Solo avisamos al dueño
      // la primera vez que escribe, para que decida si lo aprueba. No marcamos
      // el mensaje como procesado: si más adelante se aprueba, este mismo
      // mensaje debe poder recuperarse y procesarse de verdad.
      if (esNuevo) {
        await socket.sendMessage(ownJid, {
          text:
            `👤 Escribió un número nuevo: ${nombrePerfil ?? numero} (${numero})\n` +
            `Mensaje: "${texto}"\n\n` +
            `Si es cliente, ponle la etiqueta "Cliente" en WhatsApp Business (o escribe "${COMANDO_APROBAR} ${numero}" en este chat) para que el bot le empiece a responder. Si no lo es, ignora este mensaje.`,
        });
      }
      return;
    }

    // A partir de aquí el cliente está aprobado y el mensaje va a tener una
    // resolución real (respuesta automática o escalamiento a humano). Se
    // marca como procesado para que la recuperación de pendientes no lo
    // vuelva a repetir en la próxima reconexión.
    if (mensajeId) {
      await marcarMensajeProcesado(cliente.id, mensajeId);
    }

    if (cliente.requiereAtencion) {
      // Un humano ya está manejando esta conversación; el bot se queda callado.
      return;
    }

    const catalogo = await obtenerCatalogo();

    if (catalogo.length === 0) {
      await socket.sendMessage(remoteJid, {
        text: 'Hola! Por ahora no tengo la lista de precios cargada, en un momento te confirmamos tu pedido.',
      });
      return;
    }

    const interpretacion = await interpretarMensajeCliente(texto, catalogo);

    if (interpretacion.tipo === 'requiere_humano') {
      const motivo = interpretacion.motivo ?? 'mensaje que necesita revisión manual';
      await marcarRequiereAtencion(cliente.id, motivo);

      await socket.sendMessage(remoteJid, {
        text: 'Ya recibí tu mensaje. En un momento te escribe alguien de nuestro equipo para ayudarte.',
      });

      await socket.sendMessage(ownJid, {
        text:
          `⚠️ Atención requerida\n` +
          `Cliente: ${cliente.nombre} (${numero})\n` +
          `Motivo: ${motivo}\n` +
          `Mensaje: "${texto}"\n\n` +
          `El bot dejó de responderle automáticamente. Escríbele tú directamente, y cuando termines escribe ${COMANDO_REANUDAR} en ese chat para reactivarlo.`,
      });
      return;
    }

    const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
    const partes: string[] = [];

    if (interpretacion.items.length > 0) {
      const confirmados = await crearPedido(cliente.id, interpretacion.items, catalogo);

      if (confirmados.length > 0) {
        const resumen = confirmados
          .map((i) => `- ${i.producto}: ${i.kilos}kg x ${formatoCOP(i.precioUnitKg)}/kg = ${formatoCOP(i.subtotal)}`)
          .join('\n');
        const total = confirmados.reduce((acc, i) => acc + i.subtotal, 0);
        partes.push(`Pedido registrado:\n${resumen}\n\nTotal: ${formatoCOP(total)}`);
      }
    }

    if (interpretacion.productosNoDisponibles.length > 0) {
      const listaCatalogo = catalogo.map((p) => `- ${p.nombre}: ${formatoCOP(p.precioActual)}/kg`).join('\n');
      partes.push(
        `No tenemos disponible esta semana: ${interpretacion.productosNoDisponibles.join(', ')}.\n\n` +
          `Esto es lo que sí tenemos disponible:\n${listaCatalogo}`,
      );
    }

    if (partes.length > 0) {
      await socket.sendMessage(remoteJid, { text: partes.join('\n\n') + '\n\n¡Gracias!' });
      return;
    }

    // 'consulta', sin pedido ni productos no disponibles mencionados
    await socket.sendMessage(remoteJid, {
      text:
        interpretacion.respuesta ??
        "¡Hola! Soy el asistente de D'Carnes Colombia. Cuéntame qué producto y cuántos kilos necesitas, y te lo registro.",
    });
  } catch (err) {
    console.error('Error procesando mensaje de cliente:', err);
    await socket.sendMessage(remoteJid, {
      text: 'Tuvimos un problema procesando tu mensaje. Intenta de nuevo en un momento, por favor.',
    });
  }
}
