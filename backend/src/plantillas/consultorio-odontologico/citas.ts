// Plantilla: bot de agendamiento de citas para consultorio odontológico.
// Misma estructura que consultorio-medico/citas.ts, vocabulario dental.
// Para activar: ver ACTIVAR.md de esta carpeta.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NOMBRE_NEGOCIO = 'Consultorio Odontológico Sonrisas'; // cambiar por el nombre real del prospecto

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  precioActual: number;
}

export interface SolicitudCita {
  servicioId: string;
  nombreCompleto?: string;
  fechaHoraPreferida?: string;
  motivo?: string;
}

export type TipoMensajeCliente = 'agendar_cita' | 'consulta' | 'requiere_humano';

export interface InterpretacionMensaje {
  tipo: TipoMensajeCliente;
  solicitud?: SolicitudCita;
  serviciosNoDisponibles: string[];
  motivo?: string;
  respuesta?: string;
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
        description: `Clasifica el mensaje de un paciente de ${NOMBRE_NEGOCIO} y, si está pidiendo cita, extrae los datos para que la secretaria confirme disponibilidad.`,
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['agendar_cita', 'consulta', 'requiere_humano'],
              description:
                "'agendar_cita': el paciente quiere agendar, reagendar o pedir información puntual para una cita (servicio dental identificable — limpieza, ortodoncia, urgencia, etc.). Llena 'solicitud' con lo que se pueda extraer, aunque falten datos. " +
                "'consulta': preguntas generales que tú puedes resolver solo — horarios, ubicación, EPS/seguros/planes dentales aceptados, precios, saludos, agradecimientos, o el paciente no sabe qué servicio necesita (pregúntaselo tú, con opciones del catálogo). Para 'consulta' SIEMPRE llena 'respuesta'. " +
                "'requiere_humano': dolor fuerte o urgencia dental descrita (SIEMPRE clasifica así y prioriza — nunca la resuelvas tú), reclamos sobre una cita o tratamiento anterior, cancelaciones, negociación de precio, o el paciente pide explícitamente hablar con alguien. " +
                'IMPORTANTE: el bot NUNCA da diagnósticos ni recomendaciones clínicas — si el mensaje describe dolor, sangrado, trauma dental u otra urgencia, clasifica como "requiere_humano" con motivo "posible urgencia odontológica", no intentes responder tú la parte clínica.',
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
                nombreCompleto: { type: 'string', description: 'Nombre completo del paciente, si lo dio.' },
                fechaHoraPreferida: { type: 'string', description: 'Día y/o hora preferida tal como la expresó el paciente (texto libre).' },
                motivo: { type: 'string', description: 'Motivo breve, sin detalle clínico (ej. "limpieza de rutina", "primera vez", "se le cayó una calza").' },
              },
            },
            serviciosNoDisponibles: {
              type: 'array',
              description: 'Servicios que el paciente pidió y que NO están en el catálogo. Vacío si todo coincide o no aplica.',
              items: { type: 'string' },
            },
            motivo: {
              type: 'string',
              description: 'Solo cuando tipo es "requiere_humano": explica en pocas palabras por qué (ej. "posible urgencia dental", "reclamo por tratamiento anterior", "quiere hablar con la secretaria").',
            },
            respuesta: {
              type: 'string',
              description:
                `Solo cuando tipo es 'consulta': la respuesta EXACTA y completa a mandar por WhatsApp. Tono amable, profesional, cálido, como el asistente de ${NOMBRE_NEGOCIO}. Si no tienes la información real para responder algo, dilo con honestidad y ofrece confirmarlo en un momento — nunca inventes datos.`,
            },
          },
          required: ['tipo', 'serviciosNoDisponibles'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Servicios disponibles en ${NOMBRE_NEGOCIO}:\n${listaServicios || '(sin servicios cargados todavía)'}\n\nMensaje del paciente: "${mensaje}"`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) return { tipo: 'consulta', serviciosNoDisponibles: [] };

  return toolUse.input as InterpretacionMensaje;
}
