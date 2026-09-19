import { db } from "../../db/client";
import type { ItemCotizacionExcel } from "../excel-cotizacion/service";

export type FaseCuentaCobro = "esperando_formato" | "esperando_numero_fa" | "esperando_confirmacion";

export interface BorradorCuentaCobro {
  numeroCliente: string;
  cliente: string;
  items: ItemCotizacionExcel[];
  valorBase: number;
  valorIva: number | null;
  valorTotal: number | null;
  tieneIvaEnExcel: boolean;
  formato?: "personal" | "empresa";
  numeroFa?: string;
}

const HORAS_EXPIRACION_SESION = 6;

export async function obtenerSesionCuentaCobro(
  numeroCliente: string,
): Promise<{ fase: FaseCuentaCobro; datos: BorradorCuentaCobro } | null> {
  const fila = await db.sesionCuentaCobroAmg.findUnique({ where: { numeroCliente } });
  if (!fila) return null;

  const horasInactiva = (Date.now() - fila.actualizadoEn.getTime()) / (1000 * 60 * 60);
  if (horasInactiva > HORAS_EXPIRACION_SESION) {
    await db.sesionCuentaCobroAmg.delete({ where: { numeroCliente } }).catch(() => {});
    return null;
  }

  return { fase: fila.fase as FaseCuentaCobro, datos: fila.datos as unknown as BorradorCuentaCobro };
}

export async function guardarSesionCuentaCobro(
  numeroCliente: string,
  fase: FaseCuentaCobro,
  datos: BorradorCuentaCobro,
): Promise<void> {
  await db.sesionCuentaCobroAmg.upsert({
    where: { numeroCliente },
    update: { fase, datos: datos as any },
    create: { numeroCliente, fase, datos: datos as any },
  });
}

export async function borrarSesionCuentaCobro(numeroCliente: string): Promise<void> {
  await db.sesionCuentaCobroAmg.deleteMany({ where: { numeroCliente } });
}
