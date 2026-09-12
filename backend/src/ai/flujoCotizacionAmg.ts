import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000 });

export interface AjusteItem {
  nombre: string; // debe calzar (aunque sea parcial) con el nombre de un ítem ya en el borrador
  nuevoPrecioUnitario?: number;
  nuevaCantidad?: number;
  eliminar?: boolean;
}

export interface RespuestaAprobacion {
  aprobado: boolean;
  ajustes: AjusteItem[];
}

const TOOL_NAME = 'responder_resumen_cotizacion';

// Se usa en la fase "esperando_aprobacion": el jefe vio el resumen de
// precios/referencias y puede aprobar tal cual, o pedir ajustes (precio,
// cantidad, quitar un ítem) antes de que se genere el PDF final.
export async function interpretarAjusteOAprobacion(
  texto: string,
  resumenItems: string,
): Promise<RespuestaAprobacion> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    tool_choice: { type: 'tool', name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description:
          'El jefe de AMG está viendo el resumen de una cotización antes de que se genere el PDF final. Determina si la aprueba tal cual, o si pide ajustes.',
        input_schema: {
          type: 'object',
          properties: {
            aprobado: {
              type: 'boolean',
              description:
                'true si el mensaje es una aprobación clara (ej. "sí", "dale", "de acuerdo", "correcto", "así está bien"), sin pedir ningún cambio. false si pide cualquier ajuste, por pequeño que sea.',
            },
            ajustes: {
              type: 'array',
              description: 'Solo si aprobado=false: los cambios pedidos.',
              items: {
                type: 'object',
                properties: {
                  nombre: {
                    type: 'string',
                    description: 'Nombre (o parte reconocible) del ítem del resumen al que se refiere el ajuste.',
                  },
                  nuevoPrecioUnitario: { type: 'number', description: 'Nuevo precio unitario, si lo pidió cambiar.' },
                  nuevaCantidad: { type: 'number', description: 'Nueva cantidad, si la pidió cambiar.' },
                  eliminar: { type: 'boolean', description: 'true si pidió quitar ese ítem de la cotización.' },
                },
                required: ['nombre'],
              },
            },
          },
          required: ['aprobado', 'ajustes'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          `Resumen de la cotización que se le mostró al jefe:\n${resumenItems}\n\n` +
          `Respuesta del jefe: "${texto}"`,
      },
    ],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) return { aprobado: false, ajustes: [] };
  return validarRespuestaAprobacion(toolUse.input);
}

// El schema de la tool-call ya obliga tipos básicos, pero no garantiza en
// runtime que cada ajuste tenga forma correcta -- un ajuste malformado (ej.
// sin "nombre", o con un precio que no es number) se descarta en vez de
// dejarlo pasar a aplicarAjustes() con esa forma inesperada.
export function validarRespuestaAprobacion(input: unknown): RespuestaAprobacion {
  const datos = (input ?? {}) as Partial<RespuestaAprobacion>;
  const aprobado = datos.aprobado === true;

  const ajustes = Array.isArray(datos.ajustes)
    ? datos.ajustes.filter((a): a is AjusteItem => {
        if (typeof a !== 'object' || a === null) return false;
        const ajuste = a as Partial<AjusteItem>;
        if (typeof ajuste.nombre !== 'string' || ajuste.nombre.trim() === '') return false;
        if (ajuste.nuevoPrecioUnitario !== undefined && typeof ajuste.nuevoPrecioUnitario !== 'number') return false;
        if (ajuste.nuevaCantidad !== undefined && typeof ajuste.nuevaCantidad !== 'number') return false;
        if (ajuste.eliminar !== undefined && typeof ajuste.eliminar !== 'boolean') return false;
        return true;
      })
    : [];

  return { aprobado, ajustes };
}

export interface ActualizacionManoObra {
  nombre: string;
  precio: number;
}

export interface RespuestaTarifa {
  ajustePorcentaje?: number;
  actualizacionesManoObra: ActualizacionManoObra[];
}

const TOOL_NAME_TARIFA = 'responder_tarifa_tipo_cliente';

// Se usa cuando se le pregunta al jefe el % de ajuste de un tipo de cliente
// nuevo. En la práctica no siempre contesta con un porcentaje limpio -- a
// veces da precios netos ya definidos para ítems de mano de obra puntuales
// (ej: "mano de obra por servicio 105.000, cable instalado 1650, esos son
// netos con margen ya incluido") en vez de, o además de, un porcentaje. Se
// separan ambos casos para poder actualizar el catálogo real con esos
// precios sin forzar al jefe a repetirse en el formato exacto que se espera.
export async function interpretarRespuestaTarifa(texto: string, tipoCliente: string): Promise<RespuestaTarifa> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 512,
    tool_choice: { type: 'tool', name: TOOL_NAME_TARIFA },
    tools: [
      {
        name: TOOL_NAME_TARIFA,
        description:
          `Se le preguntó al jefe de AMG qué % de ajuste de precio (descuento o recargo) tiene el tipo de cliente "${tipoCliente}". ` +
          'A veces, en vez de un porcentaje limpio, da precios netos ya definidos para ítems de mano de obra puntuales. Extrae lo que corresponda de su respuesta.',
        input_schema: {
          type: 'object',
          properties: {
            ajustePorcentaje: {
              type: 'number',
              description:
                'El % de ajuste si lo dio de forma clara (ej. "-10%" -> -10, "+5%" -> 5, "sin ajuste"/"0%" -> 0). Omite este campo por completo si no dio un porcentaje.',
            },
            actualizacionesManoObra: {
              type: 'array',
              description:
                'Precios netos/absolutos de ítems de mano de obra que haya mencionado en vez de (o además de) un porcentaje. Array vacío si no mencionó ninguno.',
              items: {
                type: 'object',
                properties: {
                  nombre: {
                    type: 'string',
                    description: 'Nombre del ítem de mano de obra tal como lo describió (ej: "mano de obra por servicio", "cable instalado", "obra civil").',
                  },
                  precio: { type: 'number', description: 'El precio neto que dio para ese ítem.' },
                },
                required: ['nombre', 'precio'],
              },
            },
          },
          required: ['actualizacionesManoObra'],
        },
      },
    ],
    messages: [{ role: 'user', content: `Respuesta del jefe: "${texto}"` }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) return { actualizacionesManoObra: [] };
  return validarRespuestaTarifa(toolUse.input);
}

// Estos precios pueden terminar escritos como el precio REAL y permanente
// de un producto del catálogo (ver aplicarActualizacionesManoObra en
// messageRouter.ts) -- una forma inesperada (precio como string, sin
// nombre) se descarta acá antes de llegar tan lejos.
export function validarRespuestaTarifa(input: unknown): RespuestaTarifa {
  const datos = (input ?? {}) as Partial<RespuestaTarifa>;

  const ajustePorcentaje =
    typeof datos.ajustePorcentaje === 'number' && Number.isFinite(datos.ajustePorcentaje) ? datos.ajustePorcentaje : undefined;

  const actualizacionesManoObra = Array.isArray(datos.actualizacionesManoObra)
    ? datos.actualizacionesManoObra.filter((a): a is ActualizacionManoObra => {
        if (typeof a !== 'object' || a === null) return false;
        const act = a as Partial<ActualizacionManoObra>;
        return typeof act.nombre === 'string' && act.nombre.trim() !== '' && typeof act.precio === 'number' && Number.isFinite(act.precio);
      })
    : [];

  return { ajustePorcentaje, actualizacionesManoObra };
}

const TOOL_NAME_TIPO_DOCUMENTO = 'responder_tipo_documento';

// Se usa en la fase "esperando_tipo_documento": define si la cotización va
// como cuenta de cobro (lleva recargo 30% + IVA 19%) o factura electrónica
// (solo IVA 19%, sin recargo) -- ambas llevan IVA, la diferencia real es el
// recargo. Se interpreta con IA en vez de buscar palabras exactas, para
// aguantar como lo diga el jefe ("con factura", "es cuenta de cobro", etc).
export async function interpretarTipoDocumento(texto: string): Promise<'cuenta_cobro' | 'factura' | undefined> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    tool_choice: { type: 'tool', name: TOOL_NAME_TIPO_DOCUMENTO },
    tools: [
      {
        name: TOOL_NAME_TIPO_DOCUMENTO,
        description:
          'Se le preguntó al jefe de AMG si esta cotización va a ir como "cuenta de cobro" (lleva un recargo adicional del 30% más IVA del 19%) o "factura electrónica" (solo IVA del 19%, sin recargo). Determina cuál de las dos dijo.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['cuenta_cobro', 'factura', 'no_entendido'],
              description: '"cuenta_cobro" o "factura" si lo dijo claro (aunque sea indirecto, ej. "con recargo" = cuenta_cobro, "electrónica sin recargo" = factura). "no_entendido" si no quedó claro.',
            },
          },
          required: ['tipo'],
        },
      },
    ],
    messages: [{ role: 'user', content: `Respuesta del jefe: "${texto}"` }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const tipo = (toolUse?.input as { tipo?: string } | undefined)?.tipo;
  return tipo === 'cuenta_cobro' || tipo === 'factura' ? tipo : undefined;
}

const TIPOS_CLIENTE_CONOCIDOS = ['preferencial', 'amigo', 'integrador', 'sub', 'final vip', 'final'];
const TOOL_NAME_TIPO_CLIENTE = 'responder_tipo_cliente';

// Respaldo de detectarTipoCliente (tarifas-amg/service.ts), que solo hace
// coincidencia exacta de texto -- si el jefe escribe con un typo ("preferencia",
// "integrado") o de forma indirecta ("es como un amigo de la casa"), esa
// función no lo reconoce y se le vuelve a preguntar sin necesidad. Solo se
// llama como respaldo (no reemplaza la coincidencia exacta, que es gratis y
// ya cubre el caso normal) para no gastar una llamada a IA en cada respuesta.
export async function interpretarTipoClienteConocido(texto: string): Promise<string | undefined> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    tool_choice: { type: 'tool', name: TOOL_NAME_TIPO_CLIENTE },
    tools: [
      {
        name: TOOL_NAME_TIPO_CLIENTE,
        description:
          `Se le preguntó al jefe de AMG a qué tipo de cliente pertenece esta cotización, de esta lista fija: ${TIPOS_CLIENTE_CONOCIDOS.join(', ')}. ` +
          'El jefe puede escribirlo con typos, mayúsculas distintas, o de forma indirecta -- determina a cuál de la lista se refería.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: [...TIPOS_CLIENTE_CONOCIDOS, 'no_entendido'],
              description: 'Uno exacto de la lista si quedó claro (incluso con typos o dicho indirectamente). "no_entendido" si no corresponde a ninguno.',
            },
          },
          required: ['tipo'],
        },
      },
    ],
    messages: [{ role: 'user', content: `Respuesta del jefe: "${texto}"` }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const tipo = (toolUse?.input as { tipo?: string } | undefined)?.tipo;
  return tipo && TIPOS_CLIENTE_CONOCIDOS.includes(tipo) ? tipo : undefined;
}

export interface SolicitudHistorialCotizacion {
  esSolicitudDeHistorial: boolean;
  nombreCliente?: string;
}

const TOOL_NAME_HISTORIAL = 'interpretar_solicitud_historial';

// Distingue "mándame la cotización que le hice a Altavista" (quiere
// RECUPERAR una ya hecha) de "hazme una cotización de 4 cámaras" (quiere
// una NUEVA) -- antes de esto no había forma de reenviar un PDF viejo por
// WhatsApp, tocaba ir a la app web. Se llama solo cuando un filtro barato
// (pareceQuiereHistorial) ya sugiere que podría ser esto, no en cada mensaje.
export async function interpretarSolicitudHistorial(texto: string): Promise<SolicitudHistorialCotizacion> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    tool_choice: { type: 'tool', name: TOOL_NAME_HISTORIAL },
    tools: [
      {
        name: TOOL_NAME_HISTORIAL,
        description:
          'Determina si el jefe de AMG está pidiendo que le REENVÍEN/MUESTREN una cotización que YA EXISTE (ej. "mándame la cotización de Altavista", "la última que le hice a Mileto", "pásame el pdf de Cedritos") -- NO que le armen una cotización nueva (eso es otro flujo).',
        input_schema: {
          type: 'object',
          properties: {
            esSolicitudDeHistorial: {
              type: 'boolean',
              description: 'true SOLO si claramente pide recuperar/reenviar una cotización que ya se hizo antes. false si pide una nueva, o si no tiene nada que ver con cotizaciones.',
            },
            nombreCliente: {
              type: 'string',
              description: 'El nombre del cliente final mencionado (ej. "Altavista", "Mileto"), tal como lo escribió el jefe. Omitir si no mencionó ninguno.',
            },
          },
          required: ['esSolicitudDeHistorial'],
        },
      },
    ],
    messages: [{ role: 'user', content: `Mensaje del jefe: "${texto}"` }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  return validarSolicitudHistorial(toolUse?.input);
}

export function validarSolicitudHistorial(input: unknown): SolicitudHistorialCotizacion {
  const datos = (input ?? {}) as Partial<SolicitudHistorialCotizacion>;
  return {
    esSolicitudDeHistorial: datos.esSolicitudDeHistorial === true,
    nombreCliente: typeof datos.nombreCliente === 'string' && datos.nombreCliente.trim() !== '' ? datos.nombreCliente : undefined,
  };
}

// Filtro barato antes de gastar una llamada a IA -- solo dispara la
// interpretación completa si hay un verbo de "mándamela otra vez" Y algo que
// sugiera que se refiere a algo YA EXISTENTE (no necesariamente dice la
// palabra "cotización" -- "la última que le hice a X, pásamela" es tan común
// como "mándame la cotización de X").
export function pareceQuiereHistorial(texto: string): boolean {
  const t = texto.toLowerCase();
  const verboDeReenvio = /(mandam|manda me|env[ií]am|env[ií]a me|reenv[ií]am|reenv[ií]a me|pasam|pasa me|comp[aá]rtem|comparte me|mu[eé]strame|muestra me|busca la|ver la)/.test(t);
  const refiereAlgoExistente = /(cotizaci[oó]n|la ultima|la última|la anterior|esa misma|de nuevo)/.test(t);
  return verboDeReenvio && refiereAlgoExistente;
}

const CATEGORIAS_MANO_OBRA = ['mano de obra configuración', 'mano de obra configuracion', 'obra civil', 'técnico especializado', 'tecnico especializado', 'mano de obra'];

// Solo se usa para decidir si preguntar mano de obra otra vez o seguir --
// si el jefe contesta algo que claramente es "ninguna"/"no aplica"/"sigue",
// no tiene caso mandarlo a buscar en el catálogo.
export function pareceRespuestaVacia(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return ['no', 'ninguna', 'ninguno', 'no aplica', 'nada', 'sigue', 'siguiente', 'no necesito', 'no gracias'].some(
    (frase) => t === frase || t.startsWith(frase + ' ') || t.startsWith(frase + ','),
  );
}

const FRASES_CANCELAR_COTIZACION = [
  'olvidalo',
  'olvídalo',
  'olvida eso',
  'olvida esto',
  'olvidemos eso',
  'olvidemos esto',
  'cancela',
  'cancelar',
  'cancelalo',
  'cancélalo',
  'mejor no',
  'mejor olvidalo',
  'mejor olvídalo',
  'mejor dejalo',
  'mejor déjalo',
  'me equivoque',
  'me equivoqué',
  'fue un error',
  'error mio',
  'error mío',
  'dejalo asi',
  'déjalo así',
  'borra eso',
  'borra todo',
  'empecemos de nuevo',
  'empecemos otra vez',
  'no importa ya',
];

// El jefe puede arrepentirse o equivocarse a medias de una cotización, en
// cualquier fase del flujo guiado. Es un heurístico simple (no una llamada a
// IA por cada mensaje del flujo, que sería lento/costoso para algo tan
// reconocible) -- se revisa en continuarFlujoCotizacion antes de despachar
// según la fase. Frases cortas y ambiguas ("no", "nada") se dejan afuera a
// propósito porque ya tienen un significado propio (ver pareceRespuestaVacia:
// "no aplica esta pregunta puntual", no "cancela toda la cotización").
export function pareceQuiereCancelar(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return FRASES_CANCELAR_COTIZACION.some((frase) => t.includes(frase));
}

export { CATEGORIAS_MANO_OBRA };
