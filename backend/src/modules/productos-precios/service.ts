import { db } from '../../db/client';
import type { PrecioExtraido } from '../../ai/prices';
import type { ProductoCatalogo } from '../../ai/orders';

export async function actualizarPrecios(precios: PrecioExtraido[], fuente: string) {
  const actualizados = [];

  for (const { producto, precioPorKg } of precios) {
    const registro = await db.producto.upsert({
      where: { nombre: producto },
      update: { precioActual: precioPorKg },
      create: { nombre: producto, precioActual: precioPorKg },
    });

    await db.historialPrecio.create({
      data: { productoId: registro.id, precio: precioPorKg, fuente },
    });

    actualizados.push(registro);
  }

  return actualizados;
}

export async function obtenerCatalogo(): Promise<ProductoCatalogo[]> {
  const productos = await db.producto.findMany({ orderBy: { nombre: 'asc' } });
  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precioActual: Number(p.precioActual),
  }));
}

export async function crearProducto(nombre: string, precioActual: number, unidad = 'kg') {
  return db.producto.create({ data: { nombre, precioActual, unidad } });
}

export async function editarProducto(id: string, datos: { nombre?: string; precioActual?: number; unidad?: string }) {
  if (datos.precioActual !== undefined) {
    await db.historialPrecio.create({
      data: { productoId: id, precio: datos.precioActual, fuente: 'edicion_manual' },
    });
  }
  return db.producto.update({ where: { id }, data: datos });
}

export async function eliminarProducto(id: string) {
  return db.producto.delete({ where: { id } });
}
