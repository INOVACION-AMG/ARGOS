import { db } from '../../db/client';
import type { ItemPedido, ProductoCatalogo } from '../../ai/orders';
import { inicioDeHoyBogota } from '../../utils/fechas';

export interface ItemPedidoConfirmado {
  producto: string;
  kilos: number;
  precioUnitKg: number;
  subtotal: number;
}

export interface ResumenProductoDelDia {
  producto: string;
  kilos: number;
  subtotal: number;
}

export interface ResumenDelDia {
  items: ResumenProductoDelDia[];
  totalPedidos: number;
  totalGeneral: number;
  desde: Date;
}

export async function crearPedido(
  clienteId: string,
  items: ItemPedido[],
  catalogo: ProductoCatalogo[],
): Promise<ItemPedidoConfirmado[]> {
  const confirmados: ItemPedidoConfirmado[] = [];

  for (const item of items) {
    const producto = catalogo.find((p) => p.id === item.productoId);
    if (!producto || item.kilos <= 0) continue;

    await db.pedido.create({
      data: {
        clienteId,
        productoId: producto.id,
        kilos: item.kilos,
        precioUnitKg: producto.precioActual,
      },
    });

    confirmados.push({
      producto: producto.nombre,
      kilos: item.kilos,
      precioUnitKg: producto.precioActual,
      subtotal: item.kilos * producto.precioActual,
    });
  }

  return confirmados;
}

export async function obtenerResumenDelDia(): Promise<ResumenDelDia> {
  const desde = inicioDeHoyBogota();

  const pedidos = await db.pedido.findMany({
    where: { creadoEn: { gte: desde } },
    include: { producto: true },
  });

  const porProducto = new Map<string, { kilos: number; subtotal: number }>();

  for (const pedido of pedidos) {
    const kilos = Number(pedido.kilos);
    const precio = Number(pedido.precioUnitKg);
    const actual = porProducto.get(pedido.producto.nombre) ?? { kilos: 0, subtotal: 0 };
    actual.kilos += kilos;
    actual.subtotal += kilos * precio;
    porProducto.set(pedido.producto.nombre, actual);
  }

  const items = Array.from(porProducto.entries())
    .map(([producto, v]) => ({ producto, kilos: v.kilos, subtotal: v.subtotal }))
    .sort((a, b) => a.producto.localeCompare(b.producto));

  const totalGeneral = items.reduce((acc, i) => acc + i.subtotal, 0);

  return { items, totalPedidos: pedidos.length, totalGeneral, desde };
}
