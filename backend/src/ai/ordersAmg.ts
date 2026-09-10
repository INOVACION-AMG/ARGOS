import Anthropic from '@anthropic-ai/sdk';

// El SDK espera hasta 10 minutos por defecto -- para un chat de WhatsApp eso
// es efectivamente "colgado" desde la perspectiva del cliente. Se recorta a
// algo razonable para que una llamada lenta falle rápido y entre al mismo
// manejo de errores (escala a humano) en vez de dejar el mensaje sin
// respuesta indefinidamente.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000 });

export interface ProductoCatalogoAmg {
  id: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  tipo: string; // 'suministro' | 'mano_obra'
  unidad: string;
  precio: number;
}

export interface ItemPedidoAmg {
  productoId: string;
  cantidad: number;
}

export type TipoMensajeClienteAmg = 'cotizacion' | 'consulta' | 'requiere_humano';

export interface InterpretacionMensajeAmg {
  tipo: TipoMensajeClienteAmg;
  items: ItemPedidoAmg[];
  productosNoDisponibles: string[];
  motivo?: string;
  respuesta?: string;
}

const TOOL_NAME = 'interpretar_mensaje_amg';

export interface ImagenAmg {
  base64: string;
  mimetype: string;
}

// Cuando el cliente manda una foto (ej. una lista de equipos escrita a mano,
// una cotización de otro proveedor, una foto de los equipos instalados) en
// vez de texto, hace falta algo de texto para poder buscar candidatos en el
// catálogo (ver productos-amg/service.ts, busca por palabras clave). Esta
// primera pasada solo describe en pocas palabras qué se ve, sin catálogo de
// por medio -- la clasificación final (interpretarMensajeClienteAmg) sí
// recibe la imagen real además de esta descripción, para no perder detalle.
export async function describirImagenAmg(imagen: ImagenAmg): Promise<string> {
  const mediaType = imagen.mimetype as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagen.base64 } },
          {
            type: 'text',
            text:
              'Esta imagen se la mandó un cliente a AMG (empresa de seguridad electrónica: CCTV, control de acceso, ' +
              'alarmas, cerca eléctrica). En una sola línea y con palabras clave de producto (nombres genéricos de ' +
              'equipos, cantidades si se ven, características como megapíxeles o número de canales), describe qué ' +
              'equipos o servicios está pidiendo o mostrando. No inventes marcas ni modelos que no veas con certeza.',
          },
        ],
      },
    ],
  });

  const bloque = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return bloque?.text.trim() ?? '';
}

export async function interpretarMensajeClienteAmg(
  mensaje: string,
  catalogo: ProductoCatalogoAmg[],
  imagen?: ImagenAmg,
): Promise<InterpretacionMensajeAmg> {
  const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
  const listaProductos = catalogo
    .map((p) => `- ${p.nombre} (id: ${p.id}, sku: ${p.sku}${p.categoria ? `, ${p.categoria}` : ''}): ${formatoCOP(p.precio)}/${p.unidad}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    tool_choice: { type: 'tool', name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description:
          'Clasifica el mensaje de un cliente de AMG (empresa de seguridad electrónica: CCTV, control de acceso, alarmas, cerca eléctrica) y, si pide una cotización, extrae los ítems del catálogo que coinciden.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['cotizacion', 'consulta', 'requiere_humano'],
              description:
                "'cotizacion': el cliente pide equipos/servicios identificables del catálogo (ej. \"necesito 4 cámaras domo 4MP y el DVR\"). Llena 'items' solo con lo que SÍ coincide claramente con un producto del catálogo. " +
                "'consulta': CUALQUIER mensaje que tú mismo puedas resolver sin un humano -- saludos, agradecimientos, preguntas de precio o características de un producto puntual del catálogo, o el cliente describe una necesidad genérica sin decir qué equipo específico quiere (pregúntaselo tú). Para 'consulta' SIEMPRE llena 'respuesta'. " +
                "'requiere_humano': ÚLTIMO RECURSO -- solo cuando de verdad no lo puedes resolver tú: pide un diseño/levantamiento técnico completo de un sistema SIN decir qué equipos puntuales quiere (ej. \"quiero poner cámaras en todo el conjunto, ¿qué me recomiendan?\" -- ahí sí falta un asesor), reclamos o problemas con un servicio o cotización anterior, negociación de descuento, o pide explícitamente hablar con una persona. Un pedido concreto de productos/servicios puntuales del catálogo NUNCA es 'requiere_humano', aunque sea informal, aunque mencione mano de obra/instalación, Y AUNQUE MENCIONE EL NOMBRE DE UN CLIENTE O CONJUNTO RESIDENCIAL -- el nombre del cliente final es solo contexto de a quién se le cotiza, no una señal de que se necesite un asesor. Eso siempre es 'cotizacion'. " +
                'IMPORTANTE: que el cliente pida algo que NO está en el catálogo NUNCA es "requiere_humano" -- ponlo en "productosNoDisponibles" y sigue clasificando como "cotizacion" (si pidió algo más que sí coincide) o "consulta".',
            },
            items: {
              type: 'array',
              description: 'Solo productos/servicios que SÍ coinciden claramente con el catálogo. Vacío si ninguno coincide con certeza.',
              items: {
                type: 'object',
                properties: {
                  productoId: {
                    type: 'string',
                    description: 'El id exacto del producto del catálogo que mejor corresponde a lo que pidió el cliente',
                    enum: catalogo.length > 0 ? catalogo.map((p) => p.id) : [''],
                  },
                  cantidad: {
                    type: 'number',
                    description: 'Cantidad pedida en la unidad del producto. Si el cliente no especifica, usa 1.',
                  },
                },
                required: ['productoId', 'cantidad'],
              },
            },
            productosNoDisponibles: {
              type: 'array',
              description: 'Nombres, tal como los escribió o dijo el cliente, de equipos/servicios que pidió y que NO están en el catálogo o no se pueden identificar con certeza.',
              items: { type: 'string' },
            },
            motivo: {
              type: 'string',
              description: 'Solo cuando tipo es "requiere_humano": explica en pocas palabras por qué (ej. "pide diseño de sistema completo", "reclamo por instalación anterior").',
            },
            respuesta: {
              type: 'string',
              description:
                "Solo cuando tipo es 'consulta': la respuesta EXACTA y completa que se le va a mandar al cliente por WhatsApp. Tono amable, breve, profesional, como el asistente de AMG (empresa de seguridad electrónica: CCTV, control de acceso, alarmas, cerca eléctrica). Úsala para responder con precios/características reales del catálogo, pedir que especifique qué equipo necesita, responder saludos, o pedir amablemente que reformule si no se entendió. Si preguntan algo que no puedes responder con la información que tienes, dilo con honestidad y ofrece que el equipo de AMG se lo confirma.",
            },
          },
          required: ['tipo', 'items', 'productosNoDisponibles'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          ...(imagen
            ? [
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: imagen.mimetype as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                    data: imagen.base64,
                  },
                },
              ]
            : []),
          {
            type: 'text' as const,
            text:
              `Productos/servicios de AMG (seguridad electrónica) que coinciden con palabras clave del mensaje del cliente ` +
              `(el catálogo real tiene miles de referencias, esto es solo lo relevante a este mensaje):\n` +
              `${listaProductos || '(ninguno coincidió -- normal si el cliente saludó, agradeció, o no mencionó un equipo puntual; NO significa que el catálogo esté vacío)'}` +
              `\n\nMensaje del cliente: "${mensaje}"` +
              (imagen
                ? '\n\n(El cliente también mandó la imagen adjunta -- úsala para precisar cantidades, modelo o características si ayuda a elegir el producto correcto del catálogo.)'
                : ''),
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) return { tipo: 'consulta', items: [], productosNoDisponibles: [] };

  return toolUse.input as InterpretacionMensajeAmg;
}
