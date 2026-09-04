// Plantilla: bot de agendamiento de citas para consultorio médico.
//
// A diferencia del bot de pedidos, aquí la IA no "vende" nada: solo
// clasifica el mensaje y, si es una solicitud de cita, extrae los datos
// para que una persona (secretaria/doctor) confirme disponibilidad real.
// El bot NUNCA agenda solo ni da diagnósticos o recomendaciones médicas.
//
// Para activar: reemplazar backend/src/ai/orders.ts con este archivo
// (y actualizar los imports en messageRouter.ts, ver
// messageRouter.fragmento.ts de esta carpeta), y cambiar NOMBRE_NEGOCIO.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NOMBRE_NEGOCIO = 'Consultorio Médico Vitalis'; // cambiar por el nombre real del prospecto

// Reutiliza la tabla Producto existente como "catálogo de servicios"
// (nombre = especialidad/servicio, precioActual = valor de la consulta si
// se quiere mostrar, unidad = "consulta").
export interface ServicioCatalogo {
  id: string;
  nombre: string;
  precioActual: number;
}

export interface SolicitudCita {
  servicioId: string;
  nombreCompleto?: string;
  fechaHoraPreferida?: string; // texto libre: "mañana en la tarde", "jueves 10am"
  motivo?: string; // breve, NO detalle clínico
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
        description: `Clasifica el mensaje de un paciente de ${NOMBRE_NEGOCIO} y, si está pidiendo cita, extrae los datos para que la secretaria confirme disponibilidad.`,
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['agendar_cita', 'consulta', 'requiere_humano'],
              description:
                "'agendar_cita': el paciente quiere agendar, reagendar o pedir información puntual para una cita (especialidad/servicio identificable). Llena 'solicitud' con lo que se pueda extraer, aunque falten datos — la secretaria completa lo que falte al confirmar. " +
                "'consulta': preguntas generales que tú puedes resolver solo — horarios de atención, ubicación/dirección, qué EPS o seguros se aceptan, precios de las consultas, saludos, agradecimientos, o el paciente no sabe qué especialidad necesita (pregúntaselo tú, con opciones del catálogo). Para 'consulta' SIEMPRE llena 'respuesta' con el mensaje exacto a mandar. " +
                "'requiere_humano': urgencias médicas o síntomas graves descritos (SIEMPRE clasifica así y prioriza — nunca los resuelvas tú), reclamos sobre una cita o atención anterior, cancelaciones, negociación de precio, o el paciente pide explícitamente hablar con alguien. " +
                'IMPORTANTE: el bot NUNCA da diagnósticos, recomendaciones médicas ni interpreta síntomas — si el mensaje describe síntomas o pide consejo médico, clasifica como "requiere_humano" con motivo "posible urgencia o consulta médica que requiere evaluación profesional", no intentes responder tú la parte médica.',
            },
            solicitud: {
              type: 'object',
              description: 'Solo cuando tipo es "agendar_cita".',
              properties: {
                servicioId: {
                  type: 'string',
                  description: 'El id exacto del servicio/especialidad del catálogo que mejor corresponde. Vacío si no se pudo identificar.',
                  enum: catalogo.length > 0 ? catalogo.map((s) => s.id) : [''],
                },
                nombreCompleto: { type: 'string', description: 'Nombre completo del paciente, si lo dio.' },
                fechaHoraPreferida: { type: 'string', description: 'Día y/o hora preferida tal como la expresó el paciente (texto libre).' },
                motivo: { type: 'string', description: 'Motivo breve de la cita en una frase corta, sin detalle clínico (ej. "control", "primera vez", "dolor en rodilla").' },
              },
            },
            serviciosNoDisponibles: {
              type: 'array',
              description: 'Especialidades/servicios que el paciente pidió y que NO están en el catálogo. Vacío si todo lo que pidió coincide o no aplica.',
              items: { type: 'string' },
            },
            motivo: {
              type: 'string',
              description: 'Solo cuando tipo es "requiere_humano": explica en pocas palabras por qué (ej. "posible urgencia", "reclamo por cita anterior", "quiere hablar con la secretaria").',
            },
            respuesta: {
              type: 'string',
              description:
                `Solo cuando tipo es 'consulta': la respuesta EXACTA y completa a mandar por WhatsApp. Tono amable, profesional, cálido, como el asistente de ${NOMBRE_NEGOCIO} (no genérico ni robótico). Si no tienes la información real para responder algo (ej. no sabes el horario exacto), dilo con honestidad y ofrece confirmarlo en un momento — nunca inventes datos.`,
            },
          },
          required: ['tipo', 'serviciosNoDisponibles'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Servicios/especialidades disponibles en ${NOMBRE_NEGOCIO}:\n${listaServicios || '(sin servicios cargados todavía)'}\n\nMensaje del paciente: "${mensaje}"`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) return { tipo: 'consulta', serviciosNoDisponibles: [] };

  return toolUse.input as InterpretacionMensaje;
}
