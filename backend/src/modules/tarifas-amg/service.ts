import { db } from '../../db/client';

export interface TarifaAmg {
  nombre: string;
  ajustePorcentaje: number;
}

function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase();
}

export async function obtenerTarifa(nombre: string): Promise<TarifaAmg | null> {
  const fila = await db.tarifaClienteAmg.findUnique({ where: { nombre: normalizar(nombre) } });
  if (!fila) return null;
  return { nombre: fila.nombre, ajustePorcentaje: fila.ajustePorcentaje };
}

export async function guardarTarifa(nombre: string, ajustePorcentaje: number): Promise<TarifaAmg> {
  const fila = await db.tarifaClienteAmg.upsert({
    where: { nombre: normalizar(nombre) },
    update: { ajustePorcentaje },
    create: { nombre: normalizar(nombre), ajustePorcentaje },
  });
  return { nombre: fila.nombre, ajustePorcentaje: fila.ajustePorcentaje };
}

export async function listarTarifas(): Promise<TarifaAmg[]> {
  const filas = await db.tarifaClienteAmg.findMany({ orderBy: { nombre: 'asc' } });
  return filas.map((f) => ({ nombre: f.nombre, ajustePorcentaje: f.ajustePorcentaje }));
}

// Tipos de cliente que Argos sabe reconocer en texto libre -- ver
// messageRouter.ts, fase "esperando_tipo_cliente". No son un enum cerrado en
// la base (TarifaClienteAmg.nombre acepta cualquier texto), pero limitar el
// reconocimiento a esta lista evita falsos positivos con palabras sueltas.
export const TIPOS_CLIENTE_CONOCIDOS = ['preferencial', 'amigo', 'integrador', 'sub', 'final vip', 'final'];

export function detectarTipoCliente(texto: string): string | undefined {
  const t = texto.trim().toLowerCase();
  // "final vip" antes que "final" -- si no, "final" siempre matchearía primero.
  return TIPOS_CLIENTE_CONOCIDOS.find((tipo) => t.includes(tipo));
}
