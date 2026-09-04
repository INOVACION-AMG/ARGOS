// Plantilla: bot de agendamiento de citas para bufete jurídico.
// Misma estructura que consultorio-medico/citas.ts, adaptado a "consulta
// jurídica" en vez de "cita médica", con la misma regla dura: el bot nunca
// da asesoría legal, solo agenda.
// Para activar: ver ACTIVAR.md de esta carpeta.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NOMBRE_NEGOCIO = 'Bufete Jurídico Torres & Asociados'; // cambiar por el nombre real del prospecto

export interface ServicioCatalogo {
  id: string;
  nombre: string; // área de práctica: laboral, civil, familia, penal, etc.
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
        description: `Clasifica el mensaje de un cliente/prospecto de ${NOMBRE_NEGOCIO} y, si está pidiendo una consulta jurídica, extrae los datos para que un abogado confirme disponibilidad.`,
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['agendar_cita', 'consulta', 'requiere_humano'],
              description:
                "'agendar_cita': la persona quiere agendar una consulta jurídica y se identifica un área de práctica (laboral, civil, familia, penal, comercial, etc.). Llena 'solicitud' con lo que se pueda extraer, aunque falten datos. " +
                "'consulta': preguntas generales que tú puedes resolver solo — horarios, ubicación, tarifas de consulta, áreas que maneja el bufete, saludos, agradecimientos, o la persona no sabe qué área de práctica necesita (pregúntaselo tú, con opciones del catálogo). Para 'consulta' SIEMPRE llena 'respuesta'. " +
                "'requiere_humano': la persona pide explícitamente hablar con un abogado, describe un caso urgente (plazos legales vigentes, detención, medida cautelar), reclamo sobre un caso o cita anterior, o negociación de honorarios. " +
                'IMPORTANTE, regla dura: el bot NUNCA da asesoría legal, opina sobre un caso, ni interpreta si algo "aplica" o no legalmente — su único trabajo es agendar la consulta. Si el mensaje pide una opinión o análisis legal ("¿tengo derecho a...", "¿me pueden demandar por...", "qué dice la ley sobre..."), clasifica como "agendar_cita" (si se identifica el área) o "consulta" pidiendo que agende una cita para eso, y en la respuesta aclara amablemente que eso se revisa en la consulta con el abogado, no por WhatsApp.',
            },
            solicitud: {
              type: 'object',
              description: 'Solo cuando tipo es "agendar_cita".',
              properties: {
                servicioId: {
                  type: 'string',
                  description: 'El id exacto del área de práctica del catálogo que mejor corresponde. Vacío si no se pudo identificar.',
                  enum: catalogo.length > 0 ? catalogo.map((s) => s.id) : [''],
                },
                nombreCompleto: { type: 'string', description: 'Nombre completo de la persona, si lo dio.' },
                fechaHoraPreferida: { type: 'string', description: 'Día y/o hora preferida tal como la expresó la persona (texto libre).' },
                motivo: { type: 'string', description: 'Motivo breve, en una frase, SIN detalle del caso ni de hechos específicos (ej. "asesoría laboral", "trámite de divorcio", "contrato comercial") — el detalle se da en la consulta con el abogado, no por WhatsApp.' },
              },
            },
            serviciosNoDisponibles: {
              type: 'array',
              description: 'Áreas de práctica que la persona pidió y que NO están en el catálogo. Vacío si todo coincide o no aplica.',
              items: { type: 'string' },
            },
            motivo: {
              type: 'string',
              description: 'Solo cuando tipo es "requiere_humano": explica en pocas palabras por qué (ej. "caso urgente con plazo legal", "quiere hablar directo con el abogado", "reclamo por caso anterior").',
            },
            respuesta: {
              type: 'string',
              description:
                `Solo cuando tipo es 'consulta': la respuesta EXACTA y completa a mandar por WhatsApp. Tono profesional, claro, confiable, como el asistente de ${NOMBRE_NEGOCIO}. Si preguntan algo que requiere análisis legal, aclara con amabilidad que eso se revisa en la consulta con el abogado, y ofrece agendarla. Si no tienes la información real para responder algo, dilo con honestidad — nunca inventes datos ni des una opinión legal.`,
            },
          },
          required: ['tipo', 'serviciosNoDisponibles'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Áreas de práctica de ${NOMBRE_NEGOCIO}:\n${listaServicios || '(sin áreas cargadas todavía)'}\n\nMensaje: "${mensaje}"`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) return { tipo: 'consulta', serviciosNoDisponibles: [] };

  return toolUse.input as InterpretacionMensaje;
}
