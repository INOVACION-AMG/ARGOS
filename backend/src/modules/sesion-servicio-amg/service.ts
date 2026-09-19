import { db } from '../../db/client';
import type { ServicioTipoAmg, SistemaAmg } from '../../ai/serviciosAmg';

export type FaseServicioAmg = 'recolectando' | 'esperando_confirmacion';

// Todo lo que se va acumulando mientras Daniel arma el servicio con Argos,
// paso a paso, en varios mensajes -- mismo patrón que BorradorCotizacionAmg
// (ver sesion-cotizacion-amg/service.ts), tabla propia porque es un flujo
// totalmente distinto (crear una orden de trabajo para un técnico, no una
// cotización de venta).
export interface BorradorServicioAmg {
  numeroCliente: string;
  nombrePerfil?: string;
  clienteNombre?: string;
  // Solo se resuelve (busca/crea en la tabla real `clientes`) al llegar a
  // 'esperando_confirmacion' -- mientras se recolecta info, clienteNombre es
  // solo texto libre tal como lo escribió Daniel.
  tipo?: ServicioTipoAmg;
  sistemas: SistemaAmg[];
  descripcion?: string;
  tecnicoId?: string;
  tecnicoNombre?: string;
  fechaProgramada?: string | null;
}

export function borradorVacio(numeroCliente: string, nombrePerfil?: string): BorradorServicioAmg {
  return { numeroCliente, nombrePerfil, sistemas: [] };
}

// Igual criterio que la sesión de cotizaciones: si Daniel deja un servicio a
// medias y vuelve horas después hablando de otra cosa, no tiene sentido
// seguir arrastrando ese borrador viejo.
const HORAS_EXPIRACION_SESION = 6;

export async function obtenerSesionServicio(
  numeroCliente: string,
): Promise<{ fase: FaseServicioAmg; datos: BorradorServicioAmg } | null> {
  const fila = await db.sesionServicioAmg.findUnique({ where: { numeroCliente } });
  if (!fila) return null;

  const horasInactiva = (Date.now() - fila.actualizadoEn.getTime()) / (1000 * 60 * 60);
  if (horasInactiva > HORAS_EXPIRACION_SESION) {
    await db.sesionServicioAmg.delete({ where: { numeroCliente } }).catch(() => {});
    return null;
  }

  return { fase: fila.fase as FaseServicioAmg, datos: fila.datos as unknown as BorradorServicioAmg };
}

export async function guardarSesionServicio(
  numeroCliente: string,
  fase: FaseServicioAmg,
  datos: BorradorServicioAmg,
): Promise<void> {
  await db.sesionServicioAmg.upsert({
    where: { numeroCliente },
    update: { fase, datos: datos as any },
    create: { numeroCliente, fase, datos: datos as any },
  });
}

export async function borrarSesionServicio(numeroCliente: string): Promise<void> {
  await db.sesionServicioAmg.deleteMany({ where: { numeroCliente } });
}
