import { randomUUID } from 'crypto';
import { MessageMedia, type Client, type Message } from './greenApi';
import { extraerPreciosDeImagen } from '../ai/prices';
import { interpretarMensajeCliente } from '../ai/orders';
import { interpretarMensajeClienteAmg, describirImagenAmg, type ImagenAmg, type ProductoCatalogoAmg } from '../ai/ordersAmg';
import {
  interpretarAjusteOAprobacion,
  interpretarRespuestaTarifa,
  interpretarTipoDocumento,
  pareceRespuestaVacia,
  pareceQuiereCancelar,
  interpretarTipoClienteConocido,
  interpretarSolicitudHistorial,
  pareceQuiereHistorial,
  type ActualizacionManoObra,
} from '../ai/flujoCotizacionAmg';
import { transcribirAudio } from '../ai/transcribe';
import { actualizarPrecios, obtenerCatalogo } from '../modules/productos-precios/service';
import {
  obtenerCatalogoAmg,
  crearProductoAmg,
  actualizarPrecioProductoAmg,
  buscarProductoManoObraSimilar,
} from '../modules/productos-amg/service';
import {
  obtenerOCrearCliente,
  aprobarCliente,
  marcarRequiereAtencion,
  marcarMensajeProcesado,
  reanudarBot,
} from '../modules/clientes/service';
import { crearPedido } from '../modules/pedidos/service';
import {
  crearCotizacionAmg,
  crearCotizacionAmgDesdeItemsResueltos,
  obtenerPdfCotizacion,
  calcularTotalesCotizacion,
} from '../modules/cotizaciones-amg/service';
import {
  crearSolicitudProductoAmg,
  obtenerSolicitudPendienteMasReciente,
  marcarSolicitudResuelta,
} from '../modules/solicitudes-producto-amg/service';
import { obtenerTarifa, guardarTarifa, detectarTipoCliente } from '../modules/tarifas-amg/service';
import { buscarClienteFinal, guardarHistorialCliente } from '../modules/clientes-finales-amg/service';
import {
  obtenerSesion,
  guardarSesion,
  borrarSesion,
  borradorVacio,
  type BorradorCotizacionAmg,
  type ItemBorradorAmg,
  type FaseCotizacionAmg,
} from '../modules/sesion-cotizacion-amg/service';
import {
  obtenerSesionServicio,
  guardarSesionServicio,
  borrarSesionServicio,
  borradorVacio as borradorServicioVacio,
  type BorradorServicioAmg,
  type FaseServicioAmg,
} from '../modules/sesion-servicio-amg/service';
import { interpretarServicioAmg, type ServicioTipoAmg } from '../ai/serviciosAmg';
import {
  buscarClienteAmgPorNombre,
  crearClienteAmg,
  listarTecnicosActivosAmg,
  crearServicioAmg,
} from '../modules/servicios-amg/service';
import {
  obtenerSesionCuentaCobro,
  guardarSesionCuentaCobro,
  borrarSesionCuentaCobro,
  type BorradorCuentaCobro,
  type FaseCuentaCobro,
} from '../modules/sesion-cuenta-cobro/service';
import { parsearCotizacionExcel } from '../modules/excel-cotizacion/service';
import { interpretarRespuestaCuentaCobro } from '../ai/cuentaCobroAmg';
import { generarCuentaCobroPersonal, generarCuentaCobroEmpresa } from '../modules/cuenta-cobro/generarDocx';
import { MODO_BOT } from '../config/modo';

const COMANDO_REANUDAR = '/reanudar';
const COMANDO_APROBAR = '/aprobar';
const COMANDO_AGREGAR = '/agregar';

const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;

// WhatsApp hace eco de todo lo que se manda al chat "Tú" (incluyendo lo que
// manda el propio bot, no solo lo que el dueño escribe a mano) como un
// mensaje "fromMe" -- y el chat "Tú" trata cualquier texto así como un
// mensaje de cliente de prueba (ver más abajo). Sin este freno, una alerta
// que el bot se manda a sí mismo se reprocesa como si fuera un cliente
// nuevo, lo que puede generar otra alerta (ej. si la IA está caída) y
// entrar en bucle. Se guardan los IDs de los mensajes que el propio bot
// origina hacia sí mismo para ignorarlos cuando WhatsApp los rebota.
const idsAvisosPropios = new Set<string>();

export async function enviarAvisoOwner(client: Client, ownJid: string, texto: string) {
  const enviado = await client.sendMessage(ownJid, texto);
  if (enviado?.id?._serialized) idsAvisosPropios.add(enviado.id._serialized);
}

export function registerMessageHandler(client: Client) {
  // message_create (no 'message'): incluye también lo que el propio bot
  // manda, necesario para el truco de probar escribiéndose en el chat "Tú".
  client.on('message_create', async (msg) => {
    try {
      await handleMessage(client, msg);
    } catch (err) {
      console.error('Error manejando mensaje entrante:', err);
    }
  });
}

async function handleMessage(client: Client, msg: Message) {
  const chatId = msg.fromMe ? msg.to : msg.from;
  if (!chatId || chatId === 'status@broadcast' || chatId.endsWith('@g.us')) return;

  if (msg.id?._serialized && idsAvisosPropios.has(msg.id._serialized)) {
    idsAvisosPropios.delete(msg.id._serialized);
    return;
  }

  const ownJid = client.info.wid._serialized;
  const esChatConMigoMismo = chatId === ownJid;

  if (esChatConMigoMismo) {
    // En el chat "Tú", solo procesamos lo que el dueño se escribe a sí mismo
    // (ej. la foto de precios, o el comando para aprobar un cliente nuevo).
    if (!msg.fromMe) return;

    const textoPropio: string | undefined = msg.body.trim() || undefined;
    if (textoPropio?.toLowerCase().startsWith(COMANDO_APROBAR)) {
      const numero = textoPropio.split(/\s+/)[1];
      if (numero) {
        await aprobarCliente(numero);
        await client.sendMessage(chatId, `Listo, aprobé a ${numero} como cliente. El bot ya le va a responder normal.`);
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
        await client.sendMessage(chatId, `Listo, reactivé las respuestas automáticas para ${numero}.`);
      }
      return;
    }

    if (MODO_BOT === 'amg' && textoPropio?.toLowerCase().startsWith(COMANDO_AGREGAR)) {
      await manejarComandoAgregar(client, ownJid, textoPropio);
      return;
    }

    if (msg.hasMedia && msg.type === 'image') {
      if (MODO_BOT === 'amg') {
        const nombrePerfilImg = await obtenerNombrePerfil(msg);
        await manejarImagenAmg(client, ownJid, msg, chatId, nombrePerfilImg, textoPropio);
      } else {
        await manejarFotoDePrecios(client, msg, chatId);
      }
      return;
    }

    // Cualquier otro texto o audio en este chat se procesa igual que un
    // mensaje de cliente normal (permite probar el bot sin un segundo número).
    let textoCliente = textoPropio;
    if (!textoCliente && msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
      textoCliente = await manejarAudioEntrante(client, msg, chatId);
      if (!textoCliente) return;
    }
    if (!textoCliente) return;

    const nombrePerfil = await obtenerNombrePerfil(msg);
    await manejarMensajeDeCliente(client, ownJid, chatId, nombrePerfil, textoCliente, msg.id?._serialized);
    return;
  }

  if (msg.fromMe) {
    // El dueño escribiéndole directamente a un cliente desde su celular.
    // Solo nos interesa el comando para devolverle el control al bot.
    const comando = msg.body?.trim().toLowerCase().replace(/^\//, '');
    if (comando === 'reanudar') {
      await reanudarBot(chatId.split('@')[0]);
      await enviarAvisoOwner(client, ownJid, `Listo, reactivé las respuestas automáticas para ${chatId.split('@')[0]}.`);
    }
    return;
  }

  if (MODO_BOT === 'amg' && !(await estaAutorizadoAmg(msg, chatId))) {
    // Ignorado por completo (sin respuesta, sin tocar la base) -- Argos solo
    // le hace caso a los números en ARGOS_NUMEROS_AUTORIZADOS mientras se
    // comparte con D'Carnes. Ver .env.
    return;
  }

  if (msg.hasMedia && msg.type === 'image') {
    if (MODO_BOT === 'amg') {
      const nombrePerfilImg = await obtenerNombrePerfil(msg);
      const textoConImagen: string | undefined = msg.body.trim() || undefined;
      await manejarImagenAmg(client, ownJid, msg, chatId, nombrePerfilImg, textoConImagen);
    } else {
      await manejarFotoDePrecios(client, msg, chatId);
    }
    return;
  }

  let texto: string | undefined = msg.body.trim() || undefined;

  if (!texto && msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
    texto = await manejarAudioEntrante(client, msg, chatId);
    if (!texto) return; // no se pudo transcribir, ya se avisó al cliente
  }

  // Excel de Luisa (cuenta de cobro) -- caso puntual antes del rechazo
  // genérico de documentos de abajo, solo para su número y solo Excel.
  if (
    MODO_BOT === 'amg' &&
    msg.hasMedia &&
    msg.type === 'document' &&
    esNumeroCuentaCobroAmg(chatId.split('@')[0]) &&
    (msg.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || msg.mimetype === 'application/vnd.ms-excel')
  ) {
    await manejarExcelCuentaCobro(client, chatId, msg);
    return;
  }

  // Documentos (PDF, Word, etc.) y videos no se pueden leer todavía -- antes
  // se perdían en silencio (si venían con texto/caption, ese texto solo se
  // procesaba sin avisar que el archivo adjunto se ignoró por completo).
  if (msg.hasMedia && (msg.type === 'document' || msg.type === 'video')) {
    await client.sendMessage(
      chatId,
      'Por ahora no puedo leer documentos ni videos directamente, LÍDER. ¿Me cuentas por texto qué necesitas, o me mandas una foto?',
    );
    return;
  }

  if (!texto) return;

  const nombrePerfil = await obtenerNombrePerfil(msg);
  await manejarMensajeDeCliente(client, ownJid, chatId, nombrePerfil, texto, msg.id?._serialized);
}

async function obtenerNombrePerfil(msg: Message): Promise<string | undefined> {
  try {
    const contacto = await msg.getContact();
    return contacto.pushname || contacto.name || undefined;
  } catch {
    return undefined;
  }
}

function soloDigitos(valor: string): string {
  return valor.replace(/[^\d]/g, '');
}

// Números autorizados en modo AMG que, en vez del flujo normal de
// cotizaciones (dirigido al jefe/Fernando), deben ir al flujo de crear
// servicios técnicos (Daniel Calderón, coordinador). Separado de
// ARGOS_NUMEROS_AUTORIZADOS -- ese sigue siendo el filtro de acceso general,
// esto solo decide A CUÁL de los dos flujos se enruta un número ya admitido.
function esNumeroServiciosAmg(numero: string): boolean {
  const numeros = (process.env.ARGOS_NUMEROS_SERVICIOS_AMG ?? '')
    .split(',')
    .map((n) => soloDigitos(n))
    .filter(Boolean);
  return numeros.includes(soloDigitos(numero));
}

// Mismo criterio que esNumeroServiciosAmg, para el número de Luisa (le manda
// a Argos el Excel de cotización y recibe la cuenta de cobro en Word).
function esNumeroCuentaCobroAmg(numero: string): boolean {
  const numeros = (process.env.ARGOS_NUMEROS_CUENTA_COBRO_AMG ?? '')
    .split(',')
    .map((n) => soloDigitos(n))
    .filter(Boolean);
  return numeros.includes(soloDigitos(numero));
}

// WhatsApp a veces identifica al remitente por su número real
// (numero@c.us) y a veces por su "LID" (identificador anónimo nuevo,
// numeroOpacoo@lid) según el mensaje -- se compara contra ambas formas
// (el numero crudo del chatId, y el .jid del contacto si Whatsapp lo
// resuelve) para que la lista blanca no falle solo porque llegó en forma
// LID.
async function estaAutorizadoAmg(msg: Message, chatId: string): Promise<boolean> {
  const autorizados = (process.env.ARGOS_NUMEROS_AUTORIZADOS ?? '')
    .split(',')
    .map((n) => soloDigitos(n))
    .filter(Boolean);

  // Sin lista configurada, se niega por defecto (fail-closed) -- ver el
  // chequeo de arranque en config/modo.ts, que ya no debería dejar llegar
  // hasta acá con la lista vacía, pero esto es la última barrera.
  if (autorizados.length === 0) return false;

  const numeroChat = soloDigitos(chatId.split('@')[0]);
  if (autorizados.includes(numeroChat)) return true;

  try {
    const contacto = await msg.getContact();
    const numeroReal = soloDigitos(contacto.number ?? '');
    if (numeroReal && autorizados.includes(numeroReal)) return true;
  } catch {
    // sin contacto resuelto, se queda con lo que ya se comparó arriba
  }

  return false;
}

export async function manejarAudioEntrante(client: Client, msg: Message, chatId: string): Promise<string | undefined> {
  try {
    const media = await msg.downloadMedia();
    const buffer = Buffer.from(media.data, 'base64');
    const texto = await transcribirAudio(buffer, media.mimetype);

    if (!texto) {
      await client.sendMessage(chatId, 'No logré entender el audio. ¿Puedes escribirlo o mandarlo de nuevo?');
      return undefined;
    }

    return texto;
  } catch (err) {
    console.error('Error transcribiendo audio:', err);
    await client.sendMessage(chatId, 'Tuve un problema escuchando tu audio. ¿Puedes escribirlo, por favor?');
    return undefined;
  }
}

async function manejarFotoDePrecios(client: Client, msg: Message, chatId: string) {
  await client.sendMessage(chatId, 'Recibí la foto, dame un momento mientras leo los precios...');

  try {
    const media = await msg.downloadMedia();
    const mediaType = media.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';

    const precios = await extraerPreciosDeImagen(media.data, mediaType);

    if (precios.length === 0) {
      await client.sendMessage(chatId, 'No logré leer ningún producto en esa foto. ¿Puedes enviarla de nuevo, más clara o con mejor luz?');
      return;
    }

    const fuente = `flyer_${new Date().toISOString().slice(0, 10)}`;
    const actualizados = await actualizarPrecios(precios, fuente);

    const resumen = actualizados
      .map((p) => `- ${p.nombre}: $${p.precioActual.toString()}/kg`)
      .join('\n');

    await client.sendMessage(chatId, `Listo, actualicé ${actualizados.length} precios:\n${resumen}`);
  } catch (err) {
    console.error('Error procesando la foto de precios:', err);
    await client.sendMessage(chatId, 'Algo falló leyendo esa foto. ¿Puedes enviarla de nuevo?');
  }
}

// En modo AMG una foto no es una lista de precios (eso es cosa de D'Carnes)
// -- puede ser una lista de equipos escrita a mano, una cotización de otro
// proveedor, una foto del sitio. Se describe primero con Claude (sin
// catálogo de por medio, solo para tener texto con qué buscar candidatos) y
// esa descripción entra al mismo flujo de siempre; la imagen real se le
// pasa también a la clasificación final para no perder detalle (ver
// ordersAmg.ts).
async function manejarImagenAmg(
  client: Client,
  ownJid: string,
  msg: Message,
  chatId: string,
  nombrePerfil: string | undefined,
  textoCaption: string | undefined,
) {
  try {
    const media = await msg.downloadMedia();
    const imagen: ImagenAmg = { base64: media.data, mimetype: media.mimetype };

    const descripcion = await describirImagenAmg(imagen);
    const textoEfectivo = textoCaption ? `${textoCaption} (${descripcion})` : descripcion || 'Foto sin descripción clara.';

    await manejarMensajeDeCliente(client, ownJid, chatId, nombrePerfil, textoEfectivo, msg.id?._serialized, imagen);
  } catch (err) {
    console.error('Error interpretando imagen AMG:', err);
    await client.sendMessage(chatId, 'Tuve un problema leyendo esa imagen. ¿Puedes describirme por texto qué necesitas?');
  }
}

// Comando /agregar <precio> <nombre>: resuelve la solicitud de producto
// pendiente más reciente (ver manejarFaltantesDelFlujo más abajo), lo
// agrega de verdad al catálogo de AMG-LEGION. Si la solicitud vino de una
// cotización guiada en curso (fase != null), lo suma al borrador y sigue el
// flujo donde se quedó -- si no, es una solicitud suelta y crea una
// cotización aparte de una vez, como antes.
async function manejarComandoAgregar(client: Client, ownJid: string, textoComando: string) {
  const resto = textoComando.slice(COMANDO_AGREGAR.length).trim();
  const match = resto.match(/^(\$?[\d.,]+)\s+(.+)$/s);
  if (!match) {
    await enviarAvisoOwner(
      client,
      ownJid,
      `Formato: ${COMANDO_AGREGAR} <precio> <nombre del producto>\nEj: ${COMANDO_AGREGAR} 150000 Cerca eléctrica alambre calibre 12 x metro`,
    );
    return;
  }

  const precio = Number(match[1].replace(/[^\d]/g, ''));
  const nombre = match[2].trim();

  if (!precio || precio <= 0) {
    await enviarAvisoOwner(client, ownJid, 'No entendí el precio, escríbelo solo en números (ej: 150000).');
    return;
  }

  const solicitud = await obtenerSolicitudPendienteMasReciente();
  if (!solicitud) {
    await enviarAvisoOwner(client, ownJid, 'No hay ninguna solicitud de producto pendiente para agregar.');
    return;
  }

  try {
    const esManoDeObra = solicitud.fase === 'esperando_mano_obra';
    const producto = await crearProductoAmg(nombre, precio, esManoDeObra ? 'mano_obra' : 'suministro');
    await marcarSolicitudResuelta(solicitud.id);

    const chatIdCliente = `${solicitud.numeroCliente}@c.us`;
    const sesion = solicitud.fase ? await obtenerSesion(solicitud.numeroCliente) : null;

    if (sesion && solicitud.fase) {
      const item: ItemBorradorAmg = {
        productoId: producto.id,
        nombre: producto.nombre,
        cantidad: solicitud.cantidad,
        precioUnitario: producto.precio,
        tipo: esManoDeObra ? 'mano_obra' : 'suministro',
      };

      const borrador = sesion.datos;
      if (solicitud.fase === 'esperando_mano_obra') borrador.manoObra.push(item);
      else if (solicitud.fase === 'esperando_metraje') borrador.metraje.push(item);
      else borrador.items.push(item);

      await enviarAvisoOwner(
        client,
        ownJid,
        `Listo, agregué "${producto.nombre}" a ${formatoCOP(producto.precio)} y lo sumé a la cotización en curso.`,
      );

      const siguienteFase: FaseCotizacionAmg =
        solicitud.fase === 'recolectando_items'
          ? 'esperando_mano_obra'
          : solicitud.fase === 'esperando_mano_obra'
            ? 'esperando_metraje'
            : solicitud.fase === 'esperando_metraje'
              ? 'esperando_tipo_cliente'
              : sesion.fase;

      await avanzarAFase(client, chatIdCliente, borrador, siguienteFase);
      return;
    }

    // Sin flujo activo (solicitud suelta): crea una cotización aparte de
    // una vez, solo con este producto -- comportamiento original.
    await enviarAvisoOwner(
      client,
      ownJid,
      `Listo, agregué "${producto.nombre}" a ${formatoCOP(producto.precio)}. Le mando la cotización a ${solicitud.nombrePerfil ?? solicitud.numeroCliente}.`,
    );

    const cotizacion = await crearCotizacionAmg(
      solicitud.numeroCliente,
      solicitud.nombrePerfil ?? `Cliente ${solicitud.numeroCliente}`,
      [{ productoId: producto.id, cantidad: solicitud.cantidad }],
      [producto],
      // solicitud.id es estable y no cambia si este handler se reprocesa
      // (ej. Green API redelivera la notificación) -- protege contra crear
      // esta misma cotización dos veces.
      solicitud.id,
    );

    if (!cotizacion) return;

    const resumen = cotizacion.items
      .map((i) => `- ${i.producto}: ${i.cantidad} x ${formatoCOP(i.valorUnitario)} = ${formatoCOP(i.valorTotal)}`)
      .join('\n');

    await client.sendMessage(
      chatIdCliente,
      `¡Buenas noticias! Ya tenemos disponible lo que preguntaste.\n\n` +
        `Cotización #${cotizacion.consecutivo} generada:\n${resumen}\n\n` +
        `Subtotal: ${formatoCOP(cotizacion.subtotal)}\nIVA: ${formatoCOP(cotizacion.iva)}\nTotal: ${formatoCOP(cotizacion.total)}` +
        (cotizacion.pdfBuffer ? '\n\nTe adjunto el PDF.' : '\n\nEn un momento el equipo de AMG te confirma y te envía el PDF.'),
    );

    if (cotizacion.pdfBuffer) {
      const consecutivoLabel = String(cotizacion.consecutivo).padStart(3, '0');
      const media = new MessageMedia('application/pdf', cotizacion.pdfBuffer.toString('base64'), `Cotizacion-${consecutivoLabel}.pdf`);
      await client.sendMessage(chatIdCliente, media);
    }
  } catch (err) {
    console.error('Error agregando producto AMG:', err);
    await enviarAvisoOwner(client, ownJid, 'Tuve un problema agregando el producto. Intenta de nuevo, por favor.');
  }
}

// Antepone el nombre real del contacto (tomado del perfil de WhatsApp) en vez
// del genérico "LÍDER" en las respuestas del flujo AMG -- sin esto, cualquier
// número autorizado (el jefe, Fernando, futuros administradores) recibe el
// mismo trato impersonal. Solo reemplaza si el nombre de perfil parece un
// nombre real; si no, el flujo sigue diciendo "LÍDER" como antes.
function primerNombre(nombrePerfil: string | undefined): string {
  const crudo = nombrePerfil?.trim().split(/\s+/)[0]?.replace(/[^\p{L}]/gu, '') ?? '';
  if (crudo.length < 2) return 'LÍDER';
  return crudo.charAt(0).toUpperCase() + crudo.slice(1).toLowerCase();
}

// Envuelve el cliente de WhatsApp para que cualquier mensaje de texto que el
// flujo AMG mande con el placeholder "LÍDER" salga con el nombre real --
// sin tener que tocar cada uno de los mensajes hardcodeados en todo el
// archivo (formatearResumen, preguntaFase, continuarFlujoCotizacion, etc.),
// que ya reciben este mismo `client` en cascada.
function envolverClientePersonalizado(client: Client, nombrePerfil: string | undefined): Client {
  const nombre = primerNombre(nombrePerfil);
  if (nombre === 'LÍDER') return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'sendMessage') {
        return (chatId: string, content: string | MessageMedia) => {
          const contenidoFinal = typeof content === 'string' ? content.replace(/LÍDER/g, nombre) : content;
          return target.sendMessage(chatId, contenidoFinal);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as Client;
}

export async function manejarMensajeDeCliente(
  client: Client,
  ownJid: string,
  chatId: string,
  nombrePerfil: string | undefined,
  texto: string,
  mensajeId?: string,
  imagen?: ImagenAmg,
) {
  const numero = chatId.split('@')[0];

  try {
    const { cliente } = await obtenerOCrearCliente(numero, nombrePerfil ?? `Cliente ${numero}`);

    // El mensaje va a tener una resolución real (respuesta automática o
    // escalamiento a humano). Se marca como procesado para que no se
    // vuelva a repetir si en el futuro se reintroduce recuperación de
    // pendientes.
    if (mensajeId) {
      await marcarMensajeProcesado(cliente.id, mensajeId);
    }

    if (cliente.requiereAtencion) {
      // Un humano ya está manejando esta conversación; el bot se queda callado.
      return;
    }

    if (MODO_BOT === 'amg') {
      const clientePersonalizado = envolverClientePersonalizado(client, nombrePerfil);
      if (esNumeroServiciosAmg(numero)) {
        await resolverServicioAmg(clientePersonalizado, chatId, numero, nombrePerfil, texto);
        return;
      }
      if (esNumeroCuentaCobroAmg(numero)) {
        const sesionCuentaCobro = await obtenerSesionCuentaCobro(numero);
        if (sesionCuentaCobro) {
          await continuarCuentaCobro(clientePersonalizado, chatId, numero, sesionCuentaCobro.fase, sesionCuentaCobro.datos, texto);
          return;
        }
        await client.sendMessage(chatId, 'Hola, mándame el Excel de la cotización y te devuelvo la cuenta de cobro.');
        return;
      }
      await resolverMensajeAmg(clientePersonalizado, ownJid, chatId, cliente.id, nombrePerfil, numero, texto, imagen);
      return;
    }

    const catalogo = await obtenerCatalogo();

    if (catalogo.length === 0) {
      await client.sendMessage(chatId, 'Hola! Por ahora no tengo la lista de precios cargada, en un momento te confirmamos tu pedido.');
      return;
    }

    const interpretacion = await interpretarMensajeCliente(texto, catalogo);

    if (interpretacion.tipo === 'requiere_humano') {
      const motivo = interpretacion.motivo ?? 'mensaje que necesita revisión manual';
      await marcarRequiereAtencion(cliente.id, motivo);

      await client.sendMessage(chatId, 'Ya recibí tu mensaje. En un momento te escribe alguien de nuestro equipo para ayudarte.');

      await enviarAvisoOwner(
        client,
        ownJid,
        `⚠️ Atención requerida\n` +
          `Cliente: ${cliente.nombre} (${numero})\n` +
          `Motivo: ${motivo}\n` +
          `Mensaje: "${texto}"\n\n` +
          `El bot dejó de responderle automáticamente. Escríbele tú directamente, y cuando termines escribe ${COMANDO_REANUDAR} en ese chat para reactivarlo.`,
      );
      return;
    }

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
      await client.sendMessage(chatId, partes.join('\n\n') + '\n\n¡Gracias!');
      return;
    }

    // 'consulta', sin pedido ni productos no disponibles mencionados
    await client.sendMessage(
      chatId,
      interpretacion.respuesta ??
        "¡Hola! Soy el asistente de D'Carnes Colombia. Cuéntame qué producto y cuántos kilos necesitas, y te lo registro.",
    );
  } catch (err) {
    console.error('Error procesando mensaje de cliente:', err);
    // El catch-all de D'Carnes ("Tuvimos un problema...") también cubre
    // cualquier falla no controlada dentro de resolverMensajeAmg (ej. el
    // apagón de Supabase del 2026-09-18, que hizo que el jefe recibiera esta
    // misma disculpa genérica por cada mensaje que mandó) -- en modo AMG usa
    // un tono más cercano y personalizado en vez del genérico compartido.
    const mensajeError =
      MODO_BOT === 'amg'
        ? `Tuve un problema técnico procesando tu mensaje, ${primerNombre(nombrePerfil)}. No se perdió nada -- vuelve a escribirme en un momento y seguimos donde íbamos.`
        : 'Tuvimos un problema procesando tu mensaje. Intenta de nuevo en un momento, por favor.';
    await client.sendMessage(chatId, mensajeError);
  }
}

// Rama de MODO_BOT='amg': a diferencia de D'Carnes (una respuesta por
// mensaje), acá una cotización se arma en varios pasos con el jefe --
// ítems, mano de obra, metraje, tipo de cliente, resumen y aprobación --
// antes de generar el PDF final. El estado de en qué paso va (si hay uno
// activo) se persiste en SesionCotizacionAmg (ver sesion-cotizacion-amg).
// Atiende "mándame la cotización de X" / "la última que le hice a Y" --
// busca el cliente final en la memoria (fuzzy, ver clientes-finales-amg) y,
// si tiene una cotización real asociada, descarga el PDF ya generado (no
// hace falta rehacerlo). Los clientes sembrados desde cotizaciones viejas en
// papel/Excel no tienen `ultimaCotizacionId` -- se les avisa que solo hay
// precios de referencia, no un PDF real que mandar.
async function manejarSolicitudHistorialCotizacion(client: Client, chatId: string, nombreCliente: string | undefined) {
  if (!nombreCliente) {
    await client.sendMessage(chatId, '¿De qué cliente es la cotización que buscas, LÍDER?');
    return;
  }

  let historial: Awaited<ReturnType<typeof buscarClienteFinal>> = null;
  try {
    historial = await buscarClienteFinal(nombreCliente);
  } catch (err) {
    console.error('Error buscando historial para reenviar cotización AMG:', err);
    await client.sendMessage(chatId, 'Tuve un problema buscando ese historial, LÍDER. Intenta de nuevo en un momento.');
    return;
  }

  if (!historial) {
    await client.sendMessage(chatId, `No tengo ninguna cotización guardada de "${nombreCliente}", LÍDER.`);
    return;
  }

  if (!historial.ultimaCotizacionId) {
    const resumen = historial.items.map((it) => `- ${it.descripcion}: ${it.cantidad} x ${formatoCOP(it.precioUnitario)}`).join('\n');
    await client.sendMessage(
      chatId,
      `No tengo un PDF guardado de "${historial.nombre}" (es de antes del bot), pero sí el historial de precios, LÍDER:\n${resumen}`,
    );
    return;
  }

  const resultado = await obtenerPdfCotizacion(historial.ultimaCotizacionId);
  if (!resultado) {
    await client.sendMessage(chatId, `Encontré el registro de "${historial.nombre}", pero tuve un problema descargando el PDF, LÍDER. Ya reviso qué pasó.`);
    return;
  }

  const consecutivoLabel = String(resultado.consecutivo).padStart(3, '0');
  await client.sendMessage(chatId, `Aquí está, LÍDER -- cotización #${resultado.consecutivo} de "${historial.nombre}":`);
  const media = new MessageMedia('application/pdf', resultado.pdfBuffer.toString('base64'), `Cotizacion-${consecutivoLabel}.pdf`);
  await client.sendMessage(chatId, media);
}

const TIPO_SERVICIO_LABEL: Record<ServicioTipoAmg, string> = {
  mantenimiento_preventivo: 'Mantenimiento preventivo',
  mantenimiento_correctivo: 'Mantenimiento correctivo',
  instalacion: 'Instalación',
  suministro: 'Suministro',
};

function borradorServicioCompleto(b: BorradorServicioAmg): boolean {
  return Boolean(b.clienteNombre && b.tipo && b.sistemas.length > 0 && b.descripcion && b.tecnicoId);
}

function resumenServicioAmg(b: BorradorServicioAmg, clienteEsNuevo: boolean): string {
  return [
    `Cliente: ${b.clienteNombre}${clienteEsNuevo ? ' (nuevo, se crea al confirmar)' : ''}`,
    `Tipo: ${TIPO_SERVICIO_LABEL[b.tipo!]}`,
    `Sistema(s): ${b.sistemas.join(', ')}`,
    `Descripción: ${b.descripcion}`,
    `Técnico asignado: ${b.tecnicoNombre}`,
    `Fecha programada: ${b.fechaProgramada ?? 'sin definir'}`,
  ].join('\n');
}

function preguntaFaltanteServicioAmg(b: BorradorServicioAmg): string {
  if (!b.clienteNombre) return '¿Para qué cliente es este servicio?';
  if (!b.tipo) return '¿Qué tipo de servicio es: mantenimiento preventivo, mantenimiento correctivo, instalación o suministro?';
  if (b.sistemas.length === 0) {
    return '¿Qué sistema hay que intervenir? (CCTV, control de acceso, alarma de intrusión, detección de incendio o cerca eléctrica)';
  }
  if (!b.descripcion) return 'Cuéntame brevemente qué hay que hacer.';
  if (!b.tecnicoId) return '¿Qué técnico lo va a hacer?';
  return '¿Algo más que deba saber antes de crearlo?';
}

// Flujo de Daniel Calderón (coordinador) creando órdenes de servicio para
// técnicos por WhatsApp en vez del panel web -- ver ai/serviciosAmg.ts y
// modules/servicios-amg/service.ts. Un solo tool-call de IA por mensaje
// hace de extractor y detector de confirmación a la vez (ver comentario en
// interpretarServicioAmg), así que este flujo no necesita una máquina de
// fases tan granular como el de cotizaciones: solo "recolectando" (falta
// algo) y "esperando_confirmacion" (ya se mostró el resumen completo).
async function resolverServicioAmg(
  client: Client,
  chatId: string,
  numero: string,
  nombrePerfil: string | undefined,
  texto: string,
) {
  try {
    const sesionExistente = await obtenerSesionServicio(numero);
    const fase: FaseServicioAmg = sesionExistente?.fase ?? 'recolectando';
    const borrador: BorradorServicioAmg = sesionExistente?.datos ?? borradorServicioVacio(numero, nombrePerfil);

    const tecnicos = await listarTecnicosActivosAmg();

    const interpretacion = await interpretarServicioAmg(
      texto,
      {
        clienteNombre: borrador.clienteNombre,
        tipo: borrador.tipo,
        sistemas: borrador.sistemas,
        descripcion: borrador.descripcion,
        tecnicoNombre: borrador.tecnicoNombre,
        fechaProgramada: borrador.fechaProgramada,
      },
      tecnicos,
      fase,
      new Date().toISOString().slice(0, 10),
    );

    if (interpretacion.cancela) {
      await borrarSesionServicio(numero);
      await client.sendMessage(chatId, 'Listo, cancelé ese servicio. Cuando quieras armar otro, cuéntame qué necesitas.');
      return;
    }

    if (interpretacion.clienteNombre) borrador.clienteNombre = interpretacion.clienteNombre;
    if (interpretacion.tipo) borrador.tipo = interpretacion.tipo;
    if (interpretacion.sistemas && interpretacion.sistemas.length > 0) borrador.sistemas = interpretacion.sistemas;
    if (interpretacion.descripcion) borrador.descripcion = interpretacion.descripcion;
    if (interpretacion.fechaProgramada) borrador.fechaProgramada = interpretacion.fechaProgramada;
    if (interpretacion.tecnicoId) {
      borrador.tecnicoId = interpretacion.tecnicoId;
      borrador.tecnicoNombre = tecnicos.find((t) => t.id === interpretacion.tecnicoId)?.nombre;
    }

    if (fase === 'esperando_confirmacion' && interpretacion.confirma && borradorServicioCompleto(borrador)) {
      const comercialId = process.env.ARGOS_SERVICIOS_COMERCIAL_ID;
      if (!comercialId) throw new Error('Falta ARGOS_SERVICIOS_COMERCIAL_ID en .env');

      let cliente = await buscarClienteAmgPorNombre(borrador.clienteNombre!);
      if (!cliente) cliente = await crearClienteAmg(borrador.clienteNombre!, comercialId);

      await crearServicioAmg({
        clienteId: cliente.id,
        tipo: borrador.tipo!,
        sistemas: borrador.sistemas,
        descripcion: borrador.descripcion!,
        fechaProgramada: borrador.fechaProgramada ?? null,
        tecnicoId: borrador.tecnicoId ?? null,
        comercialId,
      });

      await borrarSesionServicio(numero);
      await client.sendMessage(
        chatId,
        `Listo -- servicio creado para "${cliente.nombre}" y asignado a ${borrador.tecnicoNombre}. ¿Necesitas crear otro?`,
      );
      return;
    }

    if (borradorServicioCompleto(borrador)) {
      const clienteExistente = await buscarClienteAmgPorNombre(borrador.clienteNombre!);
      await guardarSesionServicio(numero, 'esperando_confirmacion', borrador);
      const resumen = resumenServicioAmg(borrador, !clienteExistente);
      await client.sendMessage(chatId, `Resumen del servicio:\n\n${resumen}\n\n¿Lo creo así? (sí, o dime qué cambiar)`);
      return;
    }

    await guardarSesionServicio(numero, 'recolectando', borrador);
    await client.sendMessage(chatId, interpretacion.respuesta ?? preguntaFaltanteServicioAmg(borrador));
  } catch (err) {
    console.error('Error en flujo de servicios AMG:', err);
    await client.sendMessage(
      chatId,
      `Tuve un problema técnico armando ese servicio. No se perdió nada -- vuelve a escribirme en un momento y seguimos donde íbamos.`,
    );
  }
}

const MIMETYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function resumenCuentaCobro(datos: BorradorCuentaCobro): string {
  const lineas = [`Cliente: ${datos.cliente}`, ''];
  let categoriaAnterior: string | null = null;
  for (const item of datos.items) {
    if (item.categoria !== categoriaAnterior) {
      lineas.push(`*${item.categoria}*`);
      categoriaAnterior = item.categoria;
    }
    lineas.push(`- ${item.descripcion}: ${item.cantidad} x ${formatoCOP(item.valorUnitario)} = ${formatoCOP(item.total)}`);
  }
  lineas.push('');
  lineas.push(`Valor base: ${formatoCOP(datos.valorBase)}`);
  if (datos.formato === 'personal') {
    lineas.push(`Formato: personal (Fernando, sin IVA)${datos.numeroFa ? ` -- ${datos.numeroFa}` : ''}`);
  } else {
    const recargo = Math.round(datos.valorBase * 0.3);
    const iva = Math.round((datos.valorBase + recargo) * 0.19);
    lineas.push(`Formato: empresa AMG (recargo 30% + IVA 19%)`);
    lineas.push(`Total con recargo e IVA: ${formatoCOP(datos.valorBase + recargo + iva)}`);
  }
  return lineas.join('\n');
}

// Luisa manda un Excel de cotización (siempre la misma plantilla de
// Fernando, ver excel-cotizacion/service.ts) y Argos le devuelve la cuenta
// de cobro en Word -- personal (sin IVA, a nombre de Fernando) o empresa
// (con recargo/IVA, a nombre de AMG), según si el Excel ya trae las filas
// de IVA o no. Nunca se genera el archivo sin que Luisa confirme el resumen
// primero.
async function manejarExcelCuentaCobro(client: Client, chatId: string, msg: Message): Promise<void> {
  const numero = chatId.split('@')[0];
  try {
    const { data } = await msg.downloadMedia();
    const parseado = parsearCotizacionExcel(Buffer.from(data, 'base64'));
    if (!parseado) {
      await client.sendMessage(
        chatId,
        'No logré leer ese Excel -- ¿está armado con la plantilla de siempre (hoja "COTIZACION", con ITEM/DESCRIPCION/CANT/VALOR UNITARIO/TOTAL y una fila VALOR BASE)? Mándamelo de nuevo si le falta algo.',
      );
      return;
    }

    const formato: 'personal' | 'empresa' = parseado.tieneIva ? 'empresa' : 'personal';
    const datos: BorradorCuentaCobro = {
      numeroCliente: numero,
      cliente: parseado.cliente ?? '(sin nombre de cliente en el Excel)',
      items: parseado.items,
      valorBase: parseado.valorBase,
      valorIva: parseado.valorIva,
      valorTotal: parseado.valorTotal,
      tieneIvaEnExcel: parseado.tieneIva,
      formato,
    };

    if (formato === 'personal') {
      await guardarSesionCuentaCobro(numero, 'esperando_numero_fa', datos);
      await client.sendMessage(
        chatId,
        `Ya leí la cotización:\n\n${resumenCuentaCobro(datos)}\n\nEste Excel no trae IVA, así que te armo la cuenta de cobro personal de Fernando -- ¿qué número de cuenta de cobro le pongo? (ej. FA20039)`,
      );
      return;
    }

    await guardarSesionCuentaCobro(numero, 'esperando_confirmacion', datos);
    await client.sendMessage(chatId, `Ya leí la cotización:\n\n${resumenCuentaCobro(datos)}\n\n¿La creo así? (sí, o dime qué cambiar)`);
  } catch (err) {
    console.error('Error leyendo Excel de cuenta de cobro:', err);
    await client.sendMessage(chatId, 'Tuve un problema técnico leyendo ese Excel. Intenta mandarlo de nuevo en un momento.');
  }
}

async function continuarCuentaCobro(
  client: Client,
  chatId: string,
  numero: string,
  fase: FaseCuentaCobro,
  datos: BorradorCuentaCobro,
  texto: string,
): Promise<void> {
  try {
    const interpretacion = await interpretarRespuestaCuentaCobro(texto, fase);

    if (interpretacion.cancela) {
      await borrarSesionCuentaCobro(numero);
      await client.sendMessage(chatId, 'Listo, cancelé esa cuenta de cobro. Cuando quieras mándame otro Excel.');
      return;
    }

    if (fase === 'esperando_numero_fa') {
      if (!interpretacion.numeroFa) {
        await client.sendMessage(chatId, interpretacion.respuesta ?? '¿Qué número de cuenta de cobro le pongo? (ej. FA20039)');
        return;
      }
      datos.numeroFa = interpretacion.numeroFa;
      await guardarSesionCuentaCobro(numero, 'esperando_confirmacion', datos);
      await client.sendMessage(chatId, `${resumenCuentaCobro(datos)}\n\n¿La creo así? (sí, o dime qué cambiar)`);
      return;
    }

    // fase === 'esperando_confirmacion'
    if (!interpretacion.confirma) {
      await client.sendMessage(chatId, interpretacion.respuesta ?? '¿La creo así? Contesta sí para generarla, o cuéntame qué cambiar.');
      return;
    }

    const fecha = new Date();
    const buffer =
      datos.formato === 'personal'
        ? await generarCuentaCobroPersonal({
            numeroFa: datos.numeroFa ?? 'FA-SN',
            cliente: datos.cliente,
            items: datos.items,
            valorBase: datos.valorBase,
            fecha,
          })
        : await generarCuentaCobroEmpresa({
            numero: datos.numeroFa ?? `COT-${fecha.getTime().toString().slice(-6)}`,
            cliente: datos.cliente,
            items: datos.items,
            valorBase: datos.valorBase,
            fecha,
            esCuentaCobro: true,
          });

    const nombreArchivo = `Cuenta_de_Cobro_${datos.cliente.replace(/[^a-zA-Z0-9]+/g, '_')}.docx`;
    const media = new MessageMedia(MIMETYPE_DOCX, buffer.toString('base64'), nombreArchivo);
    await client.sendMessage(chatId, media);
    await borrarSesionCuentaCobro(numero);
  } catch (err) {
    console.error('Error en flujo de cuenta de cobro:', err);
    await client.sendMessage(chatId, 'Tuve un problema técnico generando ese documento. No se perdió nada -- escríbeme "sí" otra vez para reintentarlo.');
  }
}

async function resolverMensajeAmg(
  client: Client,
  ownJid: string,
  chatId: string,
  clienteId: string,
  nombrePerfil: string | undefined,
  numero: string,
  texto: string,
  imagen?: ImagenAmg,
) {
  console.log(`[AMG] Mensaje de ${numero} (${nombrePerfil ?? 'sin nombre'}): "${texto}"${imagen ? ' [con imagen]' : ''}`);

  const sesionExistente = await obtenerSesion(numero);
  if (sesionExistente) {
    await continuarFlujoCotizacion(client, ownJid, chatId, clienteId, nombrePerfil, numero, texto, sesionExistente, imagen);
    return;
  }

  // "Mándame la cotización de Altavista" (recuperar una ya hecha) es un
  // pedido totalmente distinto a "cotízame 4 cámaras" (armar una nueva) --
  // se revisa antes de intentar resolver ítems, con un filtro barato primero
  // para no gastar una llamada a IA en cada mensaje.
  if (pareceQuiereHistorial(texto)) {
    const solicitud = await interpretarSolicitudHistorial(texto);
    if (solicitud.esSolicitudDeHistorial) {
      await manejarSolicitudHistorialCotizacion(client, chatId, solicitud.nombreCliente);
      return;
    }
  }

  let resultado: ResultadoItemsTexto;
  try {
    resultado = await resolverItemsEnTexto(texto, imagen);
  } catch (err) {
    // A diferencia del catch genérico de D'Carnes en manejarMensajeDeCliente
    // (que solo se disculpa y sigue), aquí SÍ se escala a humano y se avisa
    // al dueño -- si esto falla en silencio, el jefe se queda sin
    // cotización y nadie se entera hasta revisar logs a mano.
    console.error('Error buscando/interpretando mensaje AMG:', err);
    await marcarRequiereAtencion(clienteId, 'error técnico buscando en el catálogo');
    await client.sendMessage(chatId, 'Tuve un problema buscando en el catálogo, LÍDER. Ya avisé al equipo para que lo revisen.');
    await enviarAvisoOwner(
      client,
      ownJid,
      `⚠️ [AMG] Falló la búsqueda/interpretación para ${nombrePerfil ?? numero} (${numero}). ` +
        `Revisa manualmente.\nMensaje: "${texto}"`,
    );
    return;
  }

  if (resultado.tipo === 'requiere_humano') {
    const motivo = resultado.motivo ?? 'mensaje que necesita revisión manual';
    console.log(`[AMG] Escalado a humano: ${numero} -- ${motivo}`);
    await marcarRequiereAtencion(clienteId, motivo);

    await client.sendMessage(chatId, 'Ya recibí tu mensaje, LÍDER. Dame un momento y te confirmo.');

    await enviarAvisoOwner(
      client,
      ownJid,
      `⚠️ [AMG] Atención requerida\n` +
        `Jefe: ${nombrePerfil ?? numero} (${numero})\n` +
        `Motivo: ${motivo}\n` +
        `Mensaje: "${texto}"\n\n` +
        `El bot dejó de responder automáticamente en ese chat. Cuando termines, escribe ${COMANDO_REANUDAR} ${numero} aquí mismo.`,
    );
    return;
  }

  const hayAlgoQueCotizar = resultado.itemsResueltos.length > 0 || resultado.productosNoDisponibles.length > 0;

  if (!hayAlgoQueCotizar) {
    if (pareceQuiereCotizar(texto)) {
      // "Argos, hazme una cotización" sin decir qué -- arranca el flujo
      // vacío y se le pregunta, en vez de responder como consulta genérica.
      const borrador = borradorVacio(numero, nombrePerfil);
      await guardarSesion(numero, 'recolectando_items', borrador);
      await client.sendMessage(chatId, 'Hola LÍDER, ¿qué necesitas cotizar? Dime los equipos/servicios y las cantidades.');
      return;
    }

    console.log(`[AMG] Consulta respondida para ${numero}`);
    await client.sendMessage(
      chatId,
      resultado.respuesta ??
        'Hola LÍDER, soy Argos. Cuéntame qué necesitas cotizar y te preparo la cotización paso a paso.',
    );

    // Si la "consulta" fue en realidad sobre productos reales del catálogo
    // (ej. Argos preguntó "¿la necesitas 2MP o 4MP, interior o exterior?"),
    // se guarda el contexto -- si no, la siguiente respuesta del jefe (ej.
    // "la segunda") se procesaría como un mensaje nuevo sin ninguna relación
    // y el bot "se pierde". Un saludo/pregunta genérica sin candidatos de
    // catálogo no necesita esto.
    if (resultado.tipo === 'consulta' && resultado.respuesta && resultado.huboCandidatosCatalogo) {
      const borrador = borradorVacio(numero, nombrePerfil);
      borrador.contextoPrevio = `Mensaje anterior del cliente: "${texto}"\nRespuesta que le diste (con opciones/pregunta): "${resultado.respuesta}"`;
      await guardarSesion(numero, 'recolectando_items', borrador);
    }
    return;
  }

  // Ya sabemos qué quiere -- arranca el flujo completo desde ítems.
  const borrador = borradorVacio(numero, nombrePerfil);
  borrador.items.push(...resultado.itemsResueltos);

  if (resultado.productosNoDisponibles.length > 0) {
    await preguntarPrecioProducto(client, chatId, borrador, resultado.productosNoDisponibles[0], 'recolectando_items');
    return;
  }

  await avanzarAFase(client, chatId, borrador, 'esperando_cliente_final');
}

function pareceQuiereCotizar(texto: string): boolean {
  return /cotiz/i.test(texto);
}

interface ResultadoItemsTexto {
  tipo: 'cotizacion' | 'consulta' | 'requiere_humano';
  itemsResueltos: ItemBorradorAmg[];
  productosNoDisponibles: string[];
  motivo?: string;
  respuesta?: string;
  huboCandidatosCatalogo: boolean;
}

// Punto único para "sacar ítems con precio de un texto libre contra el
// catálogo real" -- lo usan tanto el arranque del flujo (ítems iniciales)
// como las fases de mano de obra y metraje (una vez cargadas, son
// productos normales del catálogo, se buscan igual).
async function resolverItemsEnTexto(texto: string, imagen?: ImagenAmg): Promise<ResultadoItemsTexto> {
  const catalogo: ProductoCatalogoAmg[] = await obtenerCatalogoAmg(texto);
  const interpretacion = await interpretarMensajeClienteAmg(texto, catalogo, imagen);

  const itemsResueltos: ItemBorradorAmg[] = [];
  for (const item of interpretacion.items) {
    const producto = catalogo.find((p) => p.id === item.productoId);
    if (!producto || item.cantidad <= 0) continue;
    itemsResueltos.push({
      productoId: producto.id,
      nombre: producto.nombre,
      cantidad: item.cantidad,
      precioUnitario: producto.precio,
      tipo: producto.tipo === 'mano_obra' ? 'mano_obra' : 'suministro',
    });
  }

  return {
    tipo: interpretacion.tipo,
    itemsResueltos,
    productosNoDisponibles: interpretacion.productosNoDisponibles,
    motivo: interpretacion.motivo,
    respuesta: interpretacion.respuesta,
    huboCandidatosCatalogo: catalogo.length > 0,
  };
}

// Cuando algo pedido en cualquier fase del flujo no está en el catálogo:
// pregunta el precio directo en la MISMA conversación, en vez de mandar un
// aviso aparte con un comando para escribir a mano (confuso de recordar/
// escribir bien). El jefe solo responde un número y Argos sigue solo.
async function preguntarPrecioProducto(
  client: Client,
  chatId: string,
  borrador: BorradorCotizacionAmg,
  nombreProducto: string,
  faseOrigen: FaseCotizacionAmg,
) {
  borrador.productoPendiente = { nombre: nombreProducto, cantidad: 1, faseOrigen };
  await guardarSesion(borrador.numeroCliente, 'esperando_precio_producto', borrador);
  await client.sendMessage(
    chatId,
    `No tengo "${nombreProducto}" en el catálogo, LÍDER. ¿Cuánto vale? Dime el número y lo guardo para futuras cotizaciones.`,
  );
}

// Acepta "150000", "150.000", "$150.000" o "150 mil". Sin regla que
// adivinar el separador de miles vs. decimales -- se toman todos los
// dígitos tal cual, y "mil" multiplica por 1000 aparte.
function parsearPrecio(texto: string): number | undefined {
  const t = texto.trim().toLowerCase();
  const esMiles = /\bmil\b/.test(t);
  const soloDigitos = t.replace(/[^\d]/g, '');
  if (!soloDigitos) return undefined;

  let valor = Number(soloDigitos);
  if (esMiles) valor *= 1000;

  return valor > 0 ? valor : undefined;
}

function preguntaFase(fase: FaseCotizacionAmg): string {
  switch (fase) {
    case 'esperando_cliente_final':
      return '¿Para qué cliente final es esta cotización, LÍDER? (ej. nombre del conjunto, edificio o persona)';
    case 'esperando_mano_obra':
      return (
        '¿Necesitas mano de obra de configuración, mano de obra, obra civil o técnico especializado, LÍDER? ' +
        'Dime solo lo que aplique (o "ninguna" si no aplica a esta cotización).'
      );
    case 'esperando_metraje':
      return (
        '¿Cuántos metros necesitas de cable, ductería EMT, ductería PVC o canaleta (metálica o plástica)? ' +
        'Dime solo lo que aplique (o "ninguno" si no aplica).'
      );
    case 'esperando_tipo_cliente':
      return '¿Para qué tipo de cliente es esta cotización? (preferencial / amigo / integrador / sub / final / final vip)';
    case 'esperando_tipo_documento':
      return '¿Esta cotización va como cuenta de cobro (recargo 30% + IVA 19%) o factura electrónica (solo IVA 19%), LÍDER?';
    default:
      return '';
  }
}

function formatearResumen(borrador: BorradorCotizacionAmg): string {
  const todos = [...borrador.items, ...borrador.manoObra, ...borrador.metraje];
  const ajuste = borrador.ajustePorcentaje ?? 0;
  const esCuentaCobro = borrador.tipoDocumento === 'cuenta_cobro';

  // calcularTotalesCotizacion() es el único lugar que redondea/suma -- así
  // este resumen nunca queda desincronizado del total que finalizarCotizacion()
  // termina cobrando de verdad (ver service.ts).
  const { items: itemsCalculados, subtotal, recargo, iva, total } = calcularTotalesCotizacion(
    todos.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad, precioUnitario: it.precioUnitario })),
    ajuste,
    esCuentaCobro,
  );

  const lineas = itemsCalculados.map(
    (it) => `- ${it.nombre}: ${it.cantidad} x ${formatoCOP(it.valorUnitario)} = ${formatoCOP(it.valorTotal)}`,
  );
  const tierLine = borrador.tipoCliente
    ? `\nTipo de cliente: ${borrador.tipoCliente} (${ajuste >= 0 ? '+' : ''}${ajuste}%)`
    : '';
  const documentoLabel = esCuentaCobro ? 'Cuenta de cobro' : 'Factura electrónica';
  const recargoLine = esCuentaCobro ? `Recargo (30%): ${formatoCOP(recargo)}\n` : '';

  return (
    `Resumen de la cotización, LÍDER:\n\n${lineas.join('\n')}${tierLine}\nDocumento: ${documentoLabel}\n\n` +
    `Subtotal: ${formatoCOP(subtotal)}\n${recargoLine}IVA (19%): ${formatoCOP(iva)}\nTotal: ${formatoCOP(total)}\n\n` +
    `¿Estás de acuerdo? Si quieres ajustar algo (precio, cantidad, quitar un ítem), dímelo y te lo actualizo.`
  );
}

// Cuando el jefe contesta la pregunta de tarifa dando precios netos de
// mano de obra en vez de (o además de) un porcentaje: actualiza el catálogo
// real con esos precios (buscando primero si ya existe algo parecido, para
// no duplicar), y si ese ítem ya está en la cotización en curso también le
// actualiza el precio ahí -- pero no lo agrega como línea nueva si el jefe
// no lo había pedido para este trabajo en particular.
async function aplicarActualizacionesManoObra(
  borrador: BorradorCotizacionAmg,
  actualizaciones: ActualizacionManoObra[],
): Promise<string[]> {
  const resumen: string[] = [];

  for (const act of actualizaciones) {
    // act.precio viene de que la IA interpretó texto libre del jefe -- un
    // valor inválido acá no se queda solo en un borrador, se guarda como el
    // precio REAL y permanente del producto en el catálogo (afecta a todas
    // las cotizaciones futuras), así que se descarta antes de tocar nada.
    if (!esPrecioValido(act.precio) || act.precio === 0) {
      console.warn(`[AMG] Precio de tarifa inválido ignorado para "${act.nombre}":`, act.precio);
      continue;
    }

    let producto = await buscarProductoManoObraSimilar(act.nombre);
    if (producto) {
      if (producto.precio !== act.precio) {
        await actualizarPrecioProductoAmg(producto.id, act.precio);
      }
    } else {
      producto = await crearProductoAmg(act.nombre, act.precio, 'mano_obra');
    }

    for (const bucket of [borrador.items, borrador.manoObra, borrador.metraje]) {
      const idx = bucket.findIndex((it) => it.productoId === producto!.id);
      if (idx !== -1) bucket[idx].precioUnitario = act.precio;
    }

    resumen.push(`${producto.nombre}: ${formatoCOP(act.precio)}`);
  }

  return resumen;
}

// Guarda la sesión en la fase nueva y manda la pregunta correspondiente (o
// el resumen, si ya se llegó a la fase de aprobación).
async function avanzarAFase(client: Client, chatId: string, borrador: BorradorCotizacionAmg, nuevaFase: FaseCotizacionAmg) {
  if (nuevaFase === 'esperando_aprobacion') {
    // Se genera UNA sola vez acá (antes de que el jefe pueda aprobar) y se
    // persiste -- si el ajuste o la aprobación se reintentan, ??= evita
    // generar una llave nueva y perder la protección contra duplicados.
    borrador.idempotencyKey ??= randomUUID();
  }

  await guardarSesion(borrador.numeroCliente, nuevaFase, borrador);

  if (nuevaFase === 'esperando_aprobacion') {
    await client.sendMessage(chatId, formatearResumen(borrador));
    return;
  }

  await client.sendMessage(chatId, preguntaFase(nuevaFase));
}

// La IA extrae nuevoPrecioUnitario/nuevaCantidad de texto libre -- no hay
// garantía de que sean números razonables (podría alucinar un negativo, un
// NaN, o un valor absurdamente alto). Un valor inválido aquí terminaría en
// el resumen que ve el jefe (o, en el peor caso, en una cotización real), así
// que se descarta el ajuste puntual en vez de aplicarlo a ciegas.
// Topes de sanidad, no límites de negocio reales -- solo para atrapar una
// alucinación numérica de la IA (ej. un cero de más), no para restringir una
// cotización grande legítima.
const MAX_PRECIO_UNITARIO = 500_000_000; // $500 millones COP
const MAX_CANTIDAD = 100_000;

export function esPrecioValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= MAX_PRECIO_UNITARIO;
}
export function esCantidadValida(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= MAX_CANTIDAD;
}

// Devuelve true si de verdad modificó algo del borrador -- el llamador lo
// usa para saber si debe rotar la idempotencyKey (ver avanzarAFase): un
// ajuste real cambia lo que se va a cobrar, así que no puede compartir
// llave con un intento anterior que ya haya creado la cotización con los
// valores viejos (ver hallazgo de Codex 2026-09-12).
export function aplicarAjustes(
  borrador: BorradorCotizacionAmg,
  ajustes: { nombre: string; nuevoPrecioUnitario?: number; nuevaCantidad?: number; eliminar?: boolean }[],
): boolean {
  let huboCambios = false;

  for (const ajuste of ajustes) {
    const buckets = [borrador.items, borrador.manoObra, borrador.metraje];
    for (const bucket of buckets) {
      const nombreBuscado = ajuste.nombre.toLowerCase();
      const idx = bucket.findIndex(
        (it) => it.nombre.toLowerCase().includes(nombreBuscado) || nombreBuscado.includes(it.nombre.toLowerCase()),
      );
      if (idx === -1) continue;

      if (ajuste.eliminar) {
        bucket.splice(idx, 1);
        huboCambios = true;
      } else {
        if (ajuste.nuevoPrecioUnitario !== undefined) {
          if (esPrecioValido(ajuste.nuevoPrecioUnitario)) {
            bucket[idx].precioUnitario = ajuste.nuevoPrecioUnitario;
            huboCambios = true;
          } else {
            console.warn(`[AMG] Ajuste de precio inválido ignorado para "${ajuste.nombre}":`, ajuste.nuevoPrecioUnitario);
          }
        }
        if (ajuste.nuevaCantidad !== undefined) {
          if (esCantidadValida(ajuste.nuevaCantidad)) {
            bucket[idx].cantidad = ajuste.nuevaCantidad;
            huboCambios = true;
          } else {
            console.warn(`[AMG] Ajuste de cantidad inválido ignorado para "${ajuste.nombre}":`, ajuste.nuevaCantidad);
          }
        }
      }
      break;
    }
  }

  return huboCambios;
}

// Combina ítems + mano de obra + metraje, aplica el ajuste de tarifa a cada
// precio unitario, y crea la cotización real (con PDF) -- mismo mecanismo
// de siempre, solo que los ítems ya vienen resueltos del borrador en vez de
// buscarse de nuevo en el catálogo.
export async function finalizarCotizacion(client: Client, ownJid: string, chatId: string, borrador: BorradorCotizacionAmg) {
  const ajuste = borrador.ajustePorcentaje ?? 0;
  const todos = [...borrador.items, ...borrador.manoObra, ...borrador.metraje];

  // Defensivo: una sesión que ya estaba en 'esperando_aprobacion' de antes de
  // este cambio no traería la llave todavía -- se genera y persiste UNA sola
  // vez acá (nunca en cada intento; avanzarAFase ya la genera para toda
  // sesión nueva que llegue a esa fase).
  if (!borrador.idempotencyKey) {
    borrador.idempotencyKey = randomUUID();
    await guardarSesion(borrador.numeroCliente, 'esperando_aprobacion', borrador);
  }
  const idempotencyKey = borrador.idempotencyKey;

  // La sesión se borra solo si la cotización quedó creada (o si no había
  // nada que cotizar) -- si Supabase/la red fallan a mitad de camino, el
  // borrador se conserva para poder reintentar sin que el jefe tenga que
  // rehacer todo el flujo desde cero (ver el catch más abajo).
  // Mismo redondeo que ya vio el jefe en el resumen (ver formatearResumen) --
  // calcularTotalesCotizacion() es el único que decide el valorUnitario
  // final, acá solo se le pega de vuelta productoId/tipo por posición
  // (mismo orden en que se armó `todos`).
  const { items: itemsCalculados } = calcularTotalesCotizacion(
    todos.map((it) => ({ nombre: it.nombre, cantidad: it.cantidad, precioUnitario: it.precioUnitario })),
    ajuste,
    borrador.tipoDocumento === 'cuenta_cobro',
  );

  try {
    const cotizacion = await crearCotizacionAmgDesdeItemsResueltos(
      borrador.numeroCliente,
      borrador.clienteFinal ?? borrador.nombrePerfil ?? `Cliente ${borrador.numeroCliente}`,
      todos.map((it, i) => ({
        productoId: it.productoId,
        nombre: it.nombre,
        cantidad: it.cantidad,
        valorUnitario: itemsCalculados[i].valorUnitario,
        tipo: it.tipo,
      })),
      borrador.tipoDocumento === 'cuenta_cobro',
      idempotencyKey,
    );

    if (!cotizacion) {
      await borrarSesion(borrador.numeroCliente);
      await client.sendMessage(chatId, 'No quedó ningún ítem para cotizar, LÍDER -- si quieres, empecemos de nuevo diciéndome qué necesitas.');
      return;
    }

    await borrarSesion(borrador.numeroCliente);

    console.log(
      `[AMG] Cotización #${cotizacion.consecutivo} creada (flujo guiado) para ${borrador.numeroCliente} (total ${formatoCOP(cotizacion.total)}, pdf: ${cotizacion.pdfBuffer ? 'sí' : 'no'})`,
    );

    const resumen = cotizacion.items
      .map((i) => `- ${i.producto}: ${i.cantidad} x ${formatoCOP(i.valorUnitario)} = ${formatoCOP(i.valorTotal)}`)
      .join('\n');

    const recargoLine = cotizacion.recargo > 0 ? `Recargo (30%): ${formatoCOP(cotizacion.recargo)}\n` : '';

    await client.sendMessage(
      chatId,
      `Cotización #${cotizacion.consecutivo} generada, LÍDER:\n${resumen}\n\n` +
        `Subtotal: ${formatoCOP(cotizacion.subtotal)}\n${recargoLine}IVA (19%): ${formatoCOP(cotizacion.iva)}\nTotal: ${formatoCOP(cotizacion.total)}` +
        (cotizacion.pdfBuffer
          ? '\n\nTe adjunto el PDF.'
          : '\n\nHubo un problema generando el PDF, pero ya quedó guardada en el sistema -- te lo mando en cuanto lo resuelva.'),
    );

    if (cotizacion.pdfBuffer) {
      const consecutivoLabel = String(cotizacion.consecutivo).padStart(3, '0');
      const media = new MessageMedia('application/pdf', cotizacion.pdfBuffer.toString('base64'), `Cotizacion-${consecutivoLabel}.pdf`);
      await client.sendMessage(chatId, media);
    }

    if (borrador.clienteFinal) {
      try {
        await guardarHistorialCliente(
          borrador.clienteFinal,
          cotizacion.items.map((i) => ({ descripcion: i.producto, cantidad: i.cantidad, precioUnitario: i.valorUnitario })),
          cotizacion.id,
        );
      } catch (err) {
        // No debe tumbar la cotización ya generada -- es solo para
        // referencia futura, se pierde esta actualización puntual y ya.
        console.error('Error guardando historial de cliente final AMG:', err);
      }
    }
  } catch (err) {
    console.error('Error finalizando cotización del flujo guiado AMG:', err);
    // El borrador NO se borró (ver arriba) -- sigue en 'esperando_aprobacion',
    // así que responder "sí" otra vez reintenta sin perder nada.
    await client.sendMessage(
      chatId,
      'Tuve un problema generando la cotización final, LÍDER. No se perdió nada -- escríbeme "sí" otra vez para reintentarlo, o dime qué ajustar.',
    );
    await enviarAvisoOwner(
      client,
      ownJid,
      `⚠️ [AMG] Falló la creación final de una cotización del flujo guiado para ${borrador.numeroCliente}. El borrador se conservó para reintentar.`,
    );
  }
}

// Mismo manejo de escalado a humano que usa el mensaje de entrada
// (resolverMensajeAmg) cuando la IA clasifica el mensaje como
// 'requiere_humano' -- se repite acá porque puede pasar en medio de
// cualquier fase del flujo guiado (ej: el jefe aprovecha para describir un
// diseño completo o un reclamo mientras está cotizando otra cosa).
async function escalarAHumanoDesdeFlujo(
  client: Client,
  ownJid: string,
  chatId: string,
  clienteId: string,
  nombrePerfil: string | undefined,
  numero: string,
  texto: string,
  motivo: string | undefined,
) {
  const motivoFinal = motivo ?? 'mensaje que necesita revisión manual';
  console.log(`[AMG] Escalado a humano (a medias de un flujo): ${numero} -- ${motivoFinal}`);
  await marcarRequiereAtencion(clienteId, motivoFinal);
  await client.sendMessage(chatId, 'Ya recibí tu mensaje, LÍDER. Dame un momento y te confirmo.');
  await enviarAvisoOwner(
    client,
    ownJid,
    `⚠️ [AMG] Atención requerida (a medias de una cotización)\n` +
      `Jefe: ${nombrePerfil ?? numero} (${numero})\n` +
      `Motivo: ${motivoFinal}\n` +
      `Mensaje: "${texto}"\n\n` +
      `El bot dejó de responder automáticamente en ese chat. Cuando termines, escribe ${COMANDO_REANUDAR} ${numero} aquí mismo.`,
  );
}

// A qué fase sigue después de resolver (con precio, del catálogo o recién
// creado) o descartar un producto pendiente -- depende de en qué fase se
// había preguntado originalmente.
function siguienteFaseTrasProducto(faseOrigen: FaseCotizacionAmg): FaseCotizacionAmg {
  return faseOrigen === 'recolectando_items'
    ? 'esperando_cliente_final'
    : faseOrigen === 'esperando_mano_obra'
      ? 'esperando_metraje'
      : 'esperando_tipo_cliente';
}

// Dispatcher del flujo guiado: recibe la respuesta del jefe para lo que se
// le preguntó en la fase en la que estaba la sesión, y avanza (o se queda
// pidiendo que aclare) según corresponda.
async function continuarFlujoCotizacion(
  client: Client,
  ownJid: string,
  chatId: string,
  clienteId: string,
  nombrePerfil: string | undefined,
  numero: string,
  texto: string,
  sesion: { fase: FaseCotizacionAmg; datos: BorradorCotizacionAmg },
  imagen?: ImagenAmg,
) {
  const borrador = sesion.datos;

  // Se puede arrepentir/equivocar en cualquier fase -- excepto en
  // 'esperando_precio_producto', donde "olvídalo" significa "no agregues
  // ESE producto puntual" (se maneja ahí mismo, sin tirar toda la
  // cotización que ya llevaba armada).
  if (sesion.fase !== 'esperando_precio_producto' && pareceQuiereCancelar(texto)) {
    await borrarSesion(numero);
    await client.sendMessage(chatId, 'Listo, LÍDER, cancelé esa cotización a medias. Cuando quieras, dime qué necesitas y armamos otra.');
    return;
  }

  switch (sesion.fase) {
    case 'recolectando_items': {
      // Si Argos le había hecho una pregunta aclaratoria antes (ej. "¿la
      // necesitas 2MP o 4MP, interior o exterior?"), esta respuesta ("la
      // segunda", "para exterior") solo tiene sentido leída junto con esa
      // pregunta -- se le pasa ese contexto a la IA en vez de solo el texto
      // suelto, que por sí solo no identificaría ningún producto.
      const mensajeConContexto = borrador.contextoPrevio
        ? `${borrador.contextoPrevio}\nNueva respuesta del cliente: "${texto}"`
        : texto;
      const resultado = await resolverItemsEnTexto(mensajeConContexto, imagen);

      if (resultado.tipo === 'requiere_humano') {
        await escalarAHumanoDesdeFlujo(client, ownJid, chatId, clienteId, nombrePerfil, numero, texto, resultado.motivo);
        return;
      }

      if (resultado.itemsResueltos.length === 0 && resultado.productosNoDisponibles.length === 0) {
        if (resultado.tipo === 'consulta' && resultado.respuesta && resultado.huboCandidatosCatalogo) {
          // Sigue siendo una aclaración (puede haber varias rondas) --
          // se actualiza el contexto y se mantiene la sesión viva.
          borrador.contextoPrevio = `${mensajeConContexto}\nRespuesta que le diste (con opciones/pregunta): "${resultado.respuesta}"`;
          await guardarSesion(numero, 'recolectando_items', borrador);
          await client.sendMessage(chatId, resultado.respuesta);
          return;
        }
        await client.sendMessage(
          chatId,
          resultado.respuesta ?? 'No logré identificar ningún producto ahí, LÍDER. ¿Me confirmas qué necesitas (nombre y cantidad)?',
        );
        return;
      }
      borrador.contextoPrevio = undefined;
      borrador.items.push(...resultado.itemsResueltos);

      if (resultado.productosNoDisponibles.length > 0) {
        await preguntarPrecioProducto(client, chatId, borrador, resultado.productosNoDisponibles[0], 'recolectando_items');
        return;
      }

      await avanzarAFase(client, chatId, borrador, 'esperando_cliente_final');
      return;
    }

    case 'esperando_cliente_final': {
      borrador.clienteFinal = texto.trim();

      let historial: Awaited<ReturnType<typeof buscarClienteFinal>> = null;
      try {
        historial = await buscarClienteFinal(texto);
      } catch (err) {
        console.error('Error buscando historial de cliente final AMG:', err);
      }

      if (historial && historial.items.length > 0) {
        const resumen = historial.items
          .map((it) => `- ${it.descripcion}: ${it.cantidad} x ${formatoCOP(it.precioUnitario)}`)
          .join('\n');
        const fechaLabel = historial.ultimaCotizacion
          ? new Date(historial.ultimaCotizacion).toLocaleDateString('es-CO')
          : 'una vez anterior';
        await client.sendMessage(
          chatId,
          `Encontré historial de "${historial.nombre}" (${fechaLabel}), LÍDER:\n${resumen}\n\nEsto es solo de referencia, seguimos con la cotización actual.`,
        );
      }

      await avanzarAFase(client, chatId, borrador, 'esperando_mano_obra');
      return;
    }

    case 'esperando_mano_obra': {
      if (!pareceRespuestaVacia(texto)) {
        const resultado = await resolverItemsEnTexto(texto, imagen);

        if (resultado.tipo === 'requiere_humano') {
          await escalarAHumanoDesdeFlujo(client, ownJid, chatId, clienteId, nombrePerfil, numero, texto, resultado.motivo);
          return;
        }

        borrador.manoObra.push(...resultado.itemsResueltos.map((it) => ({ ...it, tipo: 'mano_obra' as const })));

        if (resultado.productosNoDisponibles.length > 0) {
          await preguntarPrecioProducto(client, chatId, borrador, resultado.productosNoDisponibles[0], 'esperando_mano_obra');
          return;
        }

        // Ni un producto reconocido ni "ninguna" -- no asumir en silencio
        // que no necesita mano de obra, mejor pedir que aclare.
        if (resultado.itemsResueltos.length === 0) {
          await client.sendMessage(
            chatId,
            resultado.respuesta ?? 'No te entendí, LÍDER. ¿Qué mano de obra necesitas (o dime "ninguna" si no aplica)?',
          );
          return;
        }
      }
      await avanzarAFase(client, chatId, borrador, 'esperando_metraje');
      return;
    }

    case 'esperando_metraje': {
      if (!pareceRespuestaVacia(texto)) {
        const resultado = await resolverItemsEnTexto(texto, imagen);

        if (resultado.tipo === 'requiere_humano') {
          await escalarAHumanoDesdeFlujo(client, ownJid, chatId, clienteId, nombrePerfil, numero, texto, resultado.motivo);
          return;
        }

        borrador.metraje.push(...resultado.itemsResueltos);

        if (resultado.productosNoDisponibles.length > 0) {
          await preguntarPrecioProducto(client, chatId, borrador, resultado.productosNoDisponibles[0], 'esperando_metraje');
          return;
        }

        if (resultado.itemsResueltos.length === 0) {
          await client.sendMessage(
            chatId,
            resultado.respuesta ?? 'No te entendí, LÍDER. ¿Cuánto metraje necesitas (o dime "ninguno" si no aplica)?',
          );
          return;
        }
      }
      await avanzarAFase(client, chatId, borrador, 'esperando_tipo_cliente');
      return;
    }

    case 'esperando_precio_producto': {
      const pendiente = borrador.productoPendiente;
      if (!pendiente) {
        // No debería pasar, pero por si la sesión quedó rara -- seguimos
        // sin trabar al jefe.
        await avanzarAFase(client, chatId, borrador, 'esperando_mano_obra');
        return;
      }

      // Acá "olvídalo" no significa botar toda la cotización -- el jefe ya
      // venía armando otros ítems, esto es solo sobre ESTE producto puntual
      // que no está en el catálogo. Se salta sin agregarlo y sigue el flujo.
      if (pareceQuiereCancelar(texto)) {
        borrador.productoPendiente = undefined;
        await client.sendMessage(chatId, `Listo, LÍDER, sigo sin "${pendiente.nombre}" entonces.`);
        await avanzarAFase(client, chatId, borrador, siguienteFaseTrasProducto(pendiente.faseOrigen));
        return;
      }

      const precio = parsearPrecio(texto);
      if (precio === undefined) {
        await client.sendMessage(chatId, `No entendí el precio, LÍDER. Dime solo el número (ej: 150000).`);
        return;
      }

      try {
        const esManoDeObra = pendiente.faseOrigen === 'esperando_mano_obra';
        const producto = await crearProductoAmg(pendiente.nombre, precio, esManoDeObra ? 'mano_obra' : 'suministro');

        const item: ItemBorradorAmg = {
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: pendiente.cantidad,
          precioUnitario: producto.precio,
          tipo: esManoDeObra ? 'mano_obra' : 'suministro',
        };

        if (pendiente.faseOrigen === 'esperando_mano_obra') borrador.manoObra.push(item);
        else if (pendiente.faseOrigen === 'esperando_metraje') borrador.metraje.push(item);
        else borrador.items.push(item);

        borrador.productoPendiente = undefined;

        const siguienteFase = siguienteFaseTrasProducto(pendiente.faseOrigen);

        await client.sendMessage(chatId, `Listo, guardé "${producto.nombre}" a ${formatoCOP(producto.precio)}.`);
        await avanzarAFase(client, chatId, borrador, siguienteFase);
      } catch (err) {
        console.error('Error agregando producto AMG (flujo, precio en chat):', err);
        await client.sendMessage(chatId, 'Tuve un problema guardando ese producto, LÍDER. ¿Me repites el precio?');
      }
      return;
    }

    case 'esperando_tipo_cliente': {
      if (borrador.pendienteTarifaNombre) {
        const tipoPendiente = borrador.pendienteTarifaNombre;
        const respuesta = await interpretarRespuestaTarifa(texto, tipoPendiente);

        let confirmaciones: string[] = [];
        if (respuesta.actualizacionesManoObra.length > 0) {
          try {
            confirmaciones = await aplicarActualizacionesManoObra(borrador, respuesta.actualizacionesManoObra);
          } catch (err) {
            console.error('Error actualizando precios de mano de obra desde tarifa AMG:', err);
            await client.sendMessage(chatId, 'Tuve un problema guardando esos precios, LÍDER. ¿Me los repites?');
            return;
          }
        }

        // <= -100 dejaría precios en cero o negativos; un valor no finito o
        // absurdamente alto es casi seguro un error de interpretación de la
        // IA -- en ambos casos se trata como "no dio un porcentaje válido"
        // y se le vuelve a preguntar, en vez de guardar la tarifa así.
        const ajustePorcentaje = respuesta.ajustePorcentaje;
        const ajusteValido =
          ajustePorcentaje !== undefined &&
          Number.isFinite(ajustePorcentaje) &&
          ajustePorcentaje > -100 &&
          ajustePorcentaje <= 500;

        if (!ajusteValido || ajustePorcentaje === undefined) {
          if (ajustePorcentaje !== undefined) {
            console.warn(`[AMG] % de ajuste de tarifa inválido ignorado para "${tipoPendiente}":`, ajustePorcentaje);
          }
          const encabezado = confirmaciones.length > 0 ? `Listo, actualicé:\n${confirmaciones.map((c) => `- ${c}`).join('\n')}\n\n` : '';
          await client.sendMessage(
            chatId,
            `${encabezado}Ahora sí, LÍDER -- ¿qué % de ajuste tiene "${tipoPendiente}" aparte de eso? Dime un porcentaje (ej: "-10%", "+5%", o "0%" si no lleva ningún ajuste extra).`,
          );
          await guardarSesion(numero, 'esperando_tipo_cliente', borrador);
          return;
        }

        await guardarTarifa(tipoPendiente, ajustePorcentaje);
        borrador.tipoCliente = tipoPendiente;
        borrador.ajustePorcentaje = ajustePorcentaje;
        borrador.pendienteTarifaNombre = undefined;

        if (confirmaciones.length > 0) {
          await client.sendMessage(chatId, `Listo, actualicé:\n${confirmaciones.map((c) => `- ${c}`).join('\n')}`);
        }
        await avanzarAFase(client, chatId, borrador, 'esperando_tipo_documento');
        return;
      }

      // Coincidencia exacta primero (gratis, cubre el caso normal); solo si
      // falla se recurre a IA, para aguantar typos o respuestas indirectas
      // ("es como un amigo de la casa") sin gastar una llamada de más en el
      // caso común.
      let tipo = detectarTipoCliente(texto);
      if (!tipo) {
        try {
          tipo = await interpretarTipoClienteConocido(texto);
        } catch (err) {
          console.error('Error interpretando tipo de cliente AMG:', err);
        }
      }
      if (!tipo) {
        await client.sendMessage(chatId, 'No reconocí ese tipo, LÍDER. Elige uno: preferencial, amigo, integrador, sub, final, final vip.');
        return;
      }

      const tarifaGuardada = await obtenerTarifa(tipo);
      if (tarifaGuardada) {
        borrador.tipoCliente = tarifaGuardada.nombre;
        borrador.ajustePorcentaje = tarifaGuardada.ajustePorcentaje;
        await avanzarAFase(client, chatId, borrador, 'esperando_tipo_documento');
        return;
      }

      borrador.pendienteTarifaNombre = tipo;
      await guardarSesion(numero, 'esperando_tipo_cliente', borrador);
      await client.sendMessage(
        chatId,
        `Es la primera vez que uso "${tipo}", LÍDER -- ¿qué ajuste de precio tiene? Dime un porcentaje, ej: "-10%" (descuento) o "+5%" (recargo). Lo guardo para la próxima.`,
      );
      return;
    }

    case 'esperando_tipo_documento': {
      const tipoDocumento = await interpretarTipoDocumento(texto);
      if (!tipoDocumento) {
        await client.sendMessage(chatId, 'No te entendí, LÍDER -- ¿es cuenta de cobro (recargo 30% + IVA 19%) o factura electrónica (solo IVA 19%)?');
        return;
      }
      borrador.tipoDocumento = tipoDocumento;
      await avanzarAFase(client, chatId, borrador, 'esperando_aprobacion');
      return;
    }

    case 'esperando_aprobacion': {
      const respuesta = await interpretarAjusteOAprobacion(texto, formatearResumen(borrador));

      if (respuesta.aprobado) {
        await finalizarCotizacion(client, ownJid, chatId, borrador);
        return;
      }

      const huboCambios = aplicarAjustes(borrador, respuesta.ajustes);
      // Un ajuste real cambia lo que se va a cobrar -- no puede reutilizar
      // la llave de un intento anterior (que pudo haber creado ya la
      // cotización con los valores viejos si Supabase respondió pero
      // Argos perdió la respuesta). avanzarAFase genera una nueva porque
      // queda undefined acá.
      if (huboCambios) borrador.idempotencyKey = undefined;
      await avanzarAFase(client, chatId, borrador, 'esperando_aprobacion');
      return;
    }
  }
}
