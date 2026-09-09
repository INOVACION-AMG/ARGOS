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
  return toolUse.input as RespuestaAprobacion;
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
  return toolUse.input as RespuestaTarifa;
}

const TOOL_NAME_TIPO_DOCUMENTO = 'responder_tipo_documento';

// Se usa en la fase "esperando_tipo_documento": define si la cotización
// lleva IVA (factura) o no (cuenta de cobro) -- afecta el total real, así
// que se interpreta con IA en vez de buscar palabras exactas, para aguantar
// como lo diga el jefe ("con factura", "es cuenta de cobro", "sin iva", etc).
export async function interpretarTipoDocumento(texto: string): Promise<'cuenta_cobro' | 'factura' | undefined> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    tool_choice: { type: 'tool', name: TOOL_NAME_TIPO_DOCUMENTO },
    tools: [
      {
        name: TOOL_NAME_TIPO_DOCUMENTO,
        description:
          'Se le preguntó al jefe de AMG si esta cotización va a ir como "cuenta de cobro" (no lleva IVA) o "factura" (electrónica, lleva IVA 19%). Determina cuál de las dos dijo.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['cuenta_cobro', 'factura', 'no_entendido'],
              description: '"cuenta_cobro" o "factura" si lo dijo claro (aunque sea indirecto, ej. "sin iva" = cuenta_cobro, "con iva" o "electrónica" = factura). "no_entendido" si no quedó claro.',
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
