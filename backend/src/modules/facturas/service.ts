import { db } from '../../db/client';

export type TipoFactura = 'normal' | 'electronica';

export async function pedidosPendientesDeCliente(clienteId: string) {
  return db.pedido.findMany({
    where: { clienteId, facturaId: null },
    include: { producto: true },
    orderBy: { creadoEn: 'asc' },
  });
}

export async function crearFactura(clienteId: string, pedidoIds: string[], tipo: TipoFactura, creadoPorId?: string) {
  return db.$transaction(async (tx) => {
    const pedidos = await tx.pedido.findMany({
      where: { id: { in: pedidoIds }, clienteId, facturaId: null },
    });

    if (pedidos.length === 0) {
      throw new Error('No hay pedidos pendientes válidos para facturar con esos datos.');
    }

    const total = pedidos.reduce((acc, p) => acc + Number(p.kilos) * Number(p.precioUnitKg), 0);

    const factura = await tx.factura.create({
      data: { clienteId, tipo, total, creadoPorId },
    });

    await tx.pedido.updateMany({
      where: { id: { in: pedidos.map((p) => p.id) } },
      data: { facturaId: factura.id },
    });

    // Se descuenta del inventario lo que se acaba de facturar al cliente,
    // agrupado por producto (un mismo producto puede aparecer en varios pedidos).
    const kilosPorProducto = new Map<string, number>();
    for (const p of pedidos) {
      kilosPorProducto.set(p.productoId, (kilosPorProducto.get(p.productoId) ?? 0) + Number(p.kilos));
    }
    for (const [productoId, kilos] of kilosPorProducto) {
      await tx.producto.update({
        where: { id: productoId },
        data: { existenciaKg: { decrement: kilos } },
      });
    }

    return factura;
  });
}

export interface ItemVentaDirecta {
  productoId: string;
  kilos: number;
  precioUnitKg: number;
}

// Venta hecha en el momento por un empleado en ruta: a diferencia de
// crearFactura (que empaqueta pedidos ya existentes del bot de WhatsApp),
// acá los pedidos no existen todavía — se crean junto con la factura.
export async function crearVentaDirecta(
  clienteId: string,
  items: ItemVentaDirecta[],
  tipo: TipoFactura,
  creadoPorId: string,
) {
  if (items.length === 0) {
    throw new Error('Debe incluir al menos un producto.');
  }

  return db.$transaction(async (tx) => {
    const total = items.reduce((acc, it) => acc + it.kilos * it.precioUnitKg, 0);

    const factura = await tx.factura.create({
      data: { clienteId, tipo, total, creadoPorId },
    });

    await tx.pedido.createMany({
      data: items.map((it) => ({
        clienteId,
        productoId: it.productoId,
        kilos: it.kilos,
        precioUnitKg: it.precioUnitKg,
        facturaId: factura.id,
      })),
    });

    const kilosPorProducto = new Map<string, number>();
    for (const it of items) {
      kilosPorProducto.set(it.productoId, (kilosPorProducto.get(it.productoId) ?? 0) + it.kilos);
    }
    for (const [productoId, kilos] of kilosPorProducto) {
      await tx.producto.update({
        where: { id: productoId },
        data: { existenciaKg: { decrement: kilos } },
      });
    }

    return factura;
  });
}

export async function marcarPagada(facturaId: string) {
  return db.factura.update({
    where: { id: facturaId },
    data: { estado: 'pagada', pagadaEn: new Date() },
  });
}

export async function listarFacturas(estado?: string, creadoPorId?: string) {
  return db.factura.findMany({
    where: {
      ...(estado ? { estado } : {}),
      ...(creadoPorId ? { creadoPorId } : {}),
    },
    include: { cliente: true, creadoPor: { select: { id: true, nombre: true } } },
    orderBy: { creadoEn: 'desc' },
  });
}

export async function obtenerFactura(facturaId: string) {
  return db.factura.findUnique({
    where: { id: facturaId },
    include: {
      cliente: true,
      pedidos: { include: { producto: true } },
      creadoPor: { select: { id: true, nombre: true } },
    },
  });
}
