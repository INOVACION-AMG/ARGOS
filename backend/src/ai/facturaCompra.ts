import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LineaFacturaCompra {
  nombreLeido: string;
  kilos: number;
  costoUnitKg?: number;
}

export interface FacturaCompraExtraida {
  proveedor?: string;
  items: LineaFacturaCompra[];
}

const TOOL_NAME = 'registrar_factura_compra';

export async function extraerFacturaCompra(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<FacturaCompraExtraida> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    tool_choice: { type: 'tool', name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description:
          'Transcribe una foto de una factura de compra de carnes (de un proveedor) para D\'Carnes Colombia: el proveedor y cada línea de producto con los kilos comprados.',
        input_schema: {
          type: 'object',
          properties: {
            proveedor: {
              type: 'string',
              description: 'Nombre del proveedor/vendedor que aparece en la factura, si es legible. Omitir si no se ve.',
            },
            items: {
              type: 'array',
              description: 'Cada línea/producto de la factura.',
              items: {
                type: 'object',
                properties: {
                  nombreLeido: {
                    type: 'string',
                    description: 'Nombre del producto/corte tal como aparece escrito en la factura, sin modificarlo.',
                  },
                  kilos: {
                    type: 'number',
                    description: 'Cantidad en kilos de esa línea, solo el número.',
                  },
                  costoUnitKg: {
                    type: 'number',
                    description: 'Costo por kilo en pesos colombianos, solo el número, si se alcanza a leer. Omitir si no aparece.',
                  },
                },
                required: ['nombreLeido', 'kilos'],
              },
            },
          },
          required: ['items'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text:
              "Esta es la foto de una factura de compra de carne que le hicieron a D'Carnes Colombia S.A.S. Transcribe el proveedor (si se ve) y cada línea de producto con sus kilos y costo por kilo si aparece. No inventes datos que no se alcancen a leer.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) {
    throw new Error('La IA no devolvió la factura en el formato esperado.');
  }

  return toolUse.input as FacturaCompraExtraida;
}
