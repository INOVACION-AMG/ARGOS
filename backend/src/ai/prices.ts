import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PrecioExtraido {
  producto: string;
  precioPorKg: number;
}

const TOOL_NAME = 'registrar_precios';

export async function extraerPreciosDeImagen(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<PrecioExtraido[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    tool_choice: { type: 'tool', name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: 'Registra la lista de productos y precios por kilo leídos de la foto del catálogo de precios.',
        input_schema: {
          type: 'object',
          properties: {
            precios: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  producto: {
                    type: 'string',
                    description: 'Nombre del producto tal como aparece en la lista, normalizado (ej: "Lomo de res")',
                  },
                  precioPorKg: {
                    type: 'number',
                    description: 'Precio de venta por kilo en pesos colombianos, solo el número (sin puntos, comas ni símbolos)',
                  },
                },
                required: ['producto', 'precioPorKg'],
              },
            },
          },
          required: ['precios'],
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
            text: "Esta es la foto de la lista de precios semanal de D'Carnes Colombia S.A.S. Extrae cada producto con su precio de venta por kilo en pesos colombianos.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) {
    throw new Error('La IA no devolvió los precios en el formato esperado.');
  }

  const { precios } = toolUse.input as { precios: PrecioExtraido[] };
  return precios;
}
