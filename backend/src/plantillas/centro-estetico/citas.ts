// Plantilla: bot de agendamiento de citas para centro de estética / cejas,
// pestañas y labios (microblading, laminado de cejas, extensiones de
// pestañas, micropigmentación de labios, etc.).
// Misma estructura que consultorio-medico/citas.ts, vocabulario de belleza.
// Para activar: ver ACTIVAR.md de esta carpeta.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NOMBRE_NEGOCIO = 'Cejas & Glow Studio'; // cambiar por el nombre real del negocio

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  precioActual: number;
}

export interface SolicitudCita {
  servicioId: string;
  nombreCompleto?: string;
  fechaHoraPreferida?: string; // texto libre: "mañana en la tarde", "sábado 10am"
  motivo?: string; // ej. "primera vez", "retoque", "mantenimiento"
}

export type TipoMensajeCliente = 'agendar_cita' | 'consulta' | 'requiere_humano';

export interface InterpretacionMensaje {
  tipo: TipoMensajeCliente;
  solicitud?: SolicitudCita;
  serviciosNoDisponibles: string[];
  motivo?: string; // solo si tipo === 'requiere_humano'
  respuesta?: string; // solo si tipo === 'consulta'
}

const TOOL_NAME = 'interpretar_mensaje';

export async function interpretarMensajeCliente(
  mensaje: string,
  catalogo: ServicioCatalogo[],
): Promise<InterpretacionMensaje> {
  const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
  const listaServicios = catalogo
    .map((s) => `- ${s.nombre} (id: ${s.id})${s.precioActual > 0 ? `: ${formatoCOP(s.precioActual)}` : ''}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    tool_choice: { type: 'tool', name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: `Clasifica el mensaje de una clienta de ${NOMBRE_NEGOCIO} y, si está pidiendo cita, extrae los datos para que la esteticista confirme disponibilidad.`,
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['agendar_cita', 'consulta', 'requiere_humano'],
              description:
                "'agendar_cita': la clienta quiere agendar, reagendar o pedir información puntual para una cita (servicio identificable — cejas, pestañas, labios, etc.). Llena 'solicitud' con lo que se pueda extraer, aunque falten datos — la esteticista completa lo que falte al confirmar. " +
                "'consulta': preguntas generales que tú puedes resolver solo — horarios de atención, ubicación/dirección, precios, en qué consiste un procedimiento en términos generales (duración aproximada, cuidados básicos que ya sepas por el catálogo), cuánto dura el efecto, saludos, agradecimientos, o la clienta no sabe qué servicio quiere (pregúntaselo tú, con opciones del catálogo). Para 'consulta' SIEMPRE llena 'respuesta'. " +
                "'requiere_humano': reacciones alérgicas o molestias tras un procedimiento anterior (SIEMPRE clasifica así y prioriza — nunca las resuelvas tú), reclamos sobre un servicio anterior, cancelaciones, negociación de precio, o la clienta pide explícitamente hablar con alguien. " +
                'IMPORTANTE: el bot NUNCA da recomendaciones médicas/dermatológicas ni evalúa si un procedimiento es seguro para la piel de la clienta (alergias, embarazo, condiciones de piel) — si pregunta eso, clasifica como "requiere_humano" con motivo "necesita valoración de la esteticista antes de agendar", no lo respondas tú.',
            },
            solicitud: {
              type: 'object',
              description: 'Solo cuando tipo es "agendar_cita".',
              properties: {
                servicioId: {
                  type: 'string',
                  description: 'El id exacto del servicio del catálogo que mejor corresponde. Vacío si no se pudo identificar.',
                  enum: catalogo.length > 0 ? catalogo.map((s) => s.id) : [''],
                },
                nombreCompleto: { type: 'string', description: 'Nombre completo de la clienta, si lo dio.' },
                fechaHoraPreferida: { type: 'string', description: 'Día y/o hora preferida tal como la expresó la clienta (texto libre).' },
                motivo: { type: 'string', description: 'Motivo breve (ej. "primera vez", "retoque/mantenimiento", "quitarse un procedimiento anterior").' },
              },
            },
            serviciosNoDisponibles: {
              type: 'array',
              description: 'Servicios que la clienta pidió y que NO están en el catálogo. Vacío si todo coincide o no aplica.',
              items: { type: 'string' },
            },
            motivo: {
              type: 'string',
              description: 'Solo cuando tipo es "requiere_humano": explica en pocas palabras por qué (ej. "molestia tras procedimiento anterior", "reclamo por servicio anterior", "necesita valoración antes de agendar").',
            },
            respuesta: {
              type: 'string',
              description:
                `Solo cuando tipo es 'consulta': la respuesta EXACTA y completa a mandar por WhatsApp. Tono cálido, cercano, profesional, como el asistente de ${NOMBRE_NEGOCIO} (no genérico ni robótico). Si no tienes la información real para responder algo, dilo con honestidad y ofrece confirmarlo en un momento — nunca inventes datos ni des consejos de salud/piel.`,
            },
          },
          required: ['tipo', 'serviciosNoDisponibles'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Servicios disponibles en ${NOMBRE_NEGOCIO}:\n${listaServicios || '(sin servicios cargados todavía)'}\n\nMensaje de la clienta: "${mensaje}"`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) return { tipo: 'consulta', serviciosNoDisponibles: [] };

  return toolUse.input as InterpretacionMensaje;
}
