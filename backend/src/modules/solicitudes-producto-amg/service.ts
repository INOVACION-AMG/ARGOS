import { db } from '../../db/client';

export interface SolicitudProductoAmgData {
  id: string;
  clienteId: string;
  numeroCliente: string;
  nombrePerfil: string | null;
  nombrePedido: string;
  cantidad: number;
  fase: string | null;
}

export async function crearSolicitudProductoAmg(
  clienteId: string,
  numeroCliente: string,
  nombrePerfil: string | undefined,
  nombrePedido: string,
  cantidad: number,
  fase?: string,
): Promise<void> {
  await db.solicitudProductoAmg.create({
    data: { clienteId, numeroCliente, nombrePerfil, nombrePedido, cantidad, fase },
  });
}

// Se resuelve la más reciente sin especificar cuál -- en la práctica hay
// como mucho una o dos solicitudes pendientes a la vez para un negocio
// chico, y /agregar no incluye un ID porque sería incómodo de escribir a
// mano desde el celular.
export async function obtenerSolicitudPendienteMasReciente(): Promise<SolicitudProductoAmgData | null> {
  return db.solicitudProductoAmg.findFirst({
    where: { estado: 'pendiente' },
    orderBy: { creadoEn: 'desc' },
  });
}

export async function marcarSolicitudResuelta(id: string): Promise<void> {
  await db.solicitudProductoAmg.update({
    where: { id },
    data: { estado: 'resuelto', resueltoEn: new Date() },
  });
}
