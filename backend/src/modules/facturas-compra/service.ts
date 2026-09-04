import { db } from '../../db/client';

export interface ItemFacturaCompra {
  productoId: string;
  kilos: number;
  costoUnitKg?: number;
}

export async function crearFacturaCompra(proveedor: string, items: ItemFacturaCompra[]) {
  if (items.length === 0) {
    throw new Error('La factura de compra necesita al menos un producto.');
  }

  return db.$transaction(async (tx) => {
    const total = items.reduce((acc, i) => acc + i.kilos * (i.costoUnitKg ?? 0), 0);

    const factura = await tx.facturaCompra.create({
      data: {
        proveedor,
        total: total > 0 ? total : null,
        items: {
          create: items.map((i) => ({
            productoId: i.productoId,
            kilos: i.kilos,
            costoUnitKg: i.costoUnitKg,
          })),
        },
      },
      include: { items: { include: { producto: true } } },
    });

    for (const item of items) {
      await tx.producto.update({
        where: { id: item.productoId },
        data: { existenciaKg: { increment: item.kilos } },
      });
    }

    return factura;
  });
}

export async function listarFacturasCompra() {
  return db.facturaCompra.findMany({
    include: { items: { include: { producto: true } } },
    orderBy: { creadoEn: 'desc' },
  });
}
