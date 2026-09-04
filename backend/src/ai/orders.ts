import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  precioActual: number;
}

export interface ItemPedido {
  productoId: string;
  kilos: number;
}

export type TipoMensajeCliente = 'pedido' | 'consulta' | 'requiere_humano';

export interface InterpretacionMensaje {
  tipo: TipoMensajeCliente;
  items: ItemPedido[];
  productosNoDisponibles: string[];
  motivo?: string;
  respuesta?: string;
}

const TOOL_NAME = 'interpretar_mensaje';

export async function interpretarMensajeCliente(
  mensaje: string,
  catalogo: ProductoCatalogo[],
): Promise<InterpretacionMensaje> {
  const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
  const listaProductos = catalogo
    .map((p) => `- ${p.nombre} (id: ${p.id}): ${formatoCOP(p.precioActual)}/kg`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    tool_choice: { type: 'tool', name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: 'Clasifica el mensaje de un cliente de D\'Carnes Colombia (proveedor de carnes) y, si es un pedido, extrae los productos y kilos.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['pedido', 'consulta', 'requiere_humano'],
              description:
                "'pedido': el cliente está pidiendo uno o más productos con corte y cantidad identificables. Si algún producto que pide SÍ está en el catálogo, llénalo en 'items'. " +
                "'consulta': CUALQUIER mensaje que tú mismo puedas resolver sin un humano — saludos, agradecimientos, preguntas de precio o disponibilidad, el cliente pide un producto genérico sin decir qué corte específico quiere (pregúntaselo tú), el cliente no sabe cómo hacer un pedido (explícaselo tú), o un mensaje informal/con errores que igual se entiende. Para 'consulta' SIEMPRE llena el campo 'respuesta' con el mensaje exacto a mandarle. " +
                "'requiere_humano': ÚLTIMO RECURSO — solo cuando de verdad no lo puedes resolver tú: reclamos o problemas con pedidos anteriores (faltó producto, llegó mal, cobro incorrecto), negociación de precio o descuentos, cancelar o modificar un pedido ya hecho, o el cliente pide explícitamente hablar con una persona. Un mensaje confuso, informal, con errores de escritura, o un pedido genérico sin especificar NO es 'requiere_humano' — eso lo resuelves tú clasificando como 'consulta' y preguntando/aclarando en 'respuesta'. " +
                'IMPORTANTE: que un cliente pida un producto que NO está en el catálogo NUNCA es "requiere_humano" — eso es normal, simplemente ponlo en "productosNoDisponibles" y sigue clasificando como "pedido" (si pidió algo más que sí está) o "consulta" (si no pidió nada más).',
            },
            items: {
              type: 'array',
              description: 'Solo productos que SÍ coinciden con el catálogo. Vacío si ninguno coincide.',
              items: {
                type: 'object',
                properties: {
                  productoId: {
                    type: 'string',
                    description: 'El id exacto del producto del catálogo que mejor corresponde a lo que pidió el cliente',
                    enum: catalogo.length > 0 ? catalogo.map((p) => p.id) : [''],
                  },
                  kilos: {
                    type: 'number',
                    description: 'Cantidad de kilos pedida. Si el cliente no especifica, usa 1.',
                  },
                },
                required: ['productoId', 'kilos'],
              },
            },
            productosNoDisponibles: {
              type: 'array',
              description: 'Nombres, tal como los escribió o dijo el cliente, de los productos que pidió y que NO están en el catálogo. Vacío si todo lo que pidió está disponible.',
              items: { type: 'string' },
            },
            motivo: {
              type: 'string',
              description: 'Solo cuando tipo es "requiere_humano": explica en pocas palabras por qué (ej. "reclamo por pedido anterior", "pide descuento", "quiere hablar con el dueño").',
            },
            respuesta: {
              type: 'string',
              description:
                "Solo cuando tipo es 'consulta': la respuesta EXACTA y completa que se le va a mandar al cliente por WhatsApp. Tono amable, breve, natural, como el asistente de D'Carnes Colombia (no genérico ni robótico). Úsala para: responder preguntas de precio o disponibilidad con los precios reales del catálogo, pedirle que especifique qué corte quiere si pidió algo genérico, explicarle cómo hacer un pedido si no sabe, responder saludos o agradecimientos, o pedirle amablemente que reformule si de verdad no se entendió el mensaje. " +
                "Si preguntan por domicilio: D'Carnes Colombia SÍ maneja domicilios, es parte del negocio — confirma esto siempre. Si el mensaje no trae ya esos datos, pídele al cliente (como si fuera cliente nuevo): nombre completo, dirección y barrio, zona/ciudad (para confirmar cobertura) y un teléfono de contacto. Si pregunta por otra cosa que no puedes responder con la información que tienes (horarios, formas de pago, etc.), dilo con honestidad y ofrece que en un momento se lo confirman.",
            },
          },
          required: ['tipo', 'items', 'productosNoDisponibles'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Catálogo de productos disponibles esta semana de D'Carnes Colombia:\n${listaProductos || '(sin productos cargados todavía)'}\n\nMensaje del cliente: "${mensaje}"`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) return { tipo: 'consulta', items: [], productosNoDisponibles: [] };

  return toolUse.input as InterpretacionMensaje;
}
