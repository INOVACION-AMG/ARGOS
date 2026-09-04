// Plantilla: fragmento de modules/pedidos/service.ts para el bot de
// domicilios de restaurante.
//
// Atajo pragmático para demo: se reutilizan las mismas columnas de la
// tabla Pedido que ya existen (`kilos`, `precioUnitKg`) para guardar
// "cantidad" y "precio unitario" — evita tener que correr una migración de
// Prisma solo para una demo. Si el prospecto avanza a cliente real, ahí sí
// vale la pena migrar los nombres de columna a algo genérico
// (`cantidad`/`precioUnitario`).
//
// Reemplaza crearPedido en backend/src/modules/pedidos/service.ts por esto:

import { db } from '../../db/client';
import type { ItemPedido, ProductoCatalogo } from '../../ai/orders';

export interface ItemPedidoConfirmado {
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export async function crearPedido(
  clienteId: string,
  items: ItemPedido[],
  catalogo: ProductoCatalogo[],
): Promise<ItemPedidoConfirmado[]> {
  const confirmados: ItemPedidoConfirmado[] = [];

  for (const item of items) {
    const producto = catalogo.find((p) => p.id === item.productoId);
    if (!producto || item.cantidad <= 0) continue;

    await db.pedido.create({
      data: {
        clienteId,
        productoId: producto.id,
        kilos: item.cantidad, // columna reutilizada como "cantidad", ver nota arriba
        precioUnitKg: producto.precioActual, // columna reutilizada como "precio unitario"
      },
    });

    confirmados.push({
      producto: producto.nombre,
      cantidad: item.cantidad,
      precioUnitario: producto.precioActual,
      subtotal: item.cantidad * producto.precioActual,
    });
  }

  return confirmados;
}

// obtenerResumenDelDia se puede dejar igual (solo cambia el nombre de las
// variables internas si se quiere prolijidad), no afecta el funcionamiento.
