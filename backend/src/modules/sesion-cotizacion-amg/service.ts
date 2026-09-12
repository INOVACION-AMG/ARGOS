import { db } from '../../db/client';

export type FaseCotizacionAmg =
  | 'recolectando_items'
  | 'esperando_cliente_final'
  | 'esperando_mano_obra'
  | 'esperando_metraje'
  | 'esperando_tipo_cliente'
  | 'esperando_tipo_documento'
  | 'esperando_precio_producto'
  | 'esperando_aprobacion';

export interface ItemBorradorAmg {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  tipo: 'suministro' | 'mano_obra';
}

// Todo lo que se va acumulando mientras se arma la cotización con el jefe,
// paso a paso, en varios mensajes. Se persiste como JSON en
// SesionCotizacionAmg.datos -- el bot se reinicia de vez en cuando y esto
// no se puede perder a mitad de una conversación.
export interface BorradorCotizacionAmg {
  numeroCliente: string;
  nombrePerfil?: string;
  // Cliente FINAL de la cotización (ej. "Altavista del Portal") -- distinto
  // del "tipo de cliente" (tarifa). Se pregunta en la fase
  // 'esperando_cliente_final', justo después de recolectar ítems. Ver
  // modules/clientes-finales-amg/service.ts.
  clienteFinal?: string;
  // Cuando Argos le hace una pregunta aclaratoria al jefe (ej. "¿la
  // necesitas para interior o exterior, 2MP o 4MP?") antes de que se
  // identifique un producto concreto, se guarda aquí para que la siguiente
  // respuesta ("la segunda", "para exterior") se interprete en ese contexto
  // en vez de como un mensaje nuevo sin relación. Se limpia en cuanto se
  // resuelve algo concreto. Ver `recolectando_items` en messageRouter.ts.
  contextoPrevio?: string;
  items: ItemBorradorAmg[];
  manoObra: ItemBorradorAmg[];
  metraje: ItemBorradorAmg[];
  tipoCliente?: string;
  ajustePorcentaje?: number;
  // 'cuenta_cobro' lleva recargo del 30% además del IVA del 19%; 'factura'
  // solo lleva el IVA del 19% -- se pregunta siempre, no se asume, porque
  // cambia el total real que paga el cliente.
  tipoDocumento?: 'cuenta_cobro' | 'factura';
  // Cuando se detectó un tipo de cliente nuevo (sin tarifa guardada) y se le
  // preguntó al jefe el % de ajuste -- mientras esto tenga valor, la fase
  // 'esperando_tipo_cliente' interpreta la siguiente respuesta como ese %,
  // no como un nombre de tipo nuevo.
  pendienteTarifaNombre?: string;
  // Cuando algo pedido no está en el catálogo, se pregunta el precio ahí
  // mismo en la conversación (nada de comandos) -- mientras esto tenga
  // valor, la fase 'esperando_precio_producto' interpreta la siguiente
  // respuesta como ese precio, lo agrega al catálogo real y sigue el flujo
  // desde `faseOrigen` (la fase en la que se detectó el faltante).
  productoPendiente?: { nombre: string; cantidad: number; faseOrigen: FaseCotizacionAmg };
  productosNoDisponibles: string[];
}

export function borradorVacio(numeroCliente: string, nombrePerfil?: string): BorradorCotizacionAmg {
  return { numeroCliente, nombrePerfil, items: [], manoObra: [], metraje: [], productosNoDisponibles: [] };
}

// Si el jefe deja una cotización (o incluso una simple aclaración de
// producto, ver contextoPrevio) a medias y vuelve horas o días después
// hablando de otra cosa, no tiene sentido seguir arrastrando ese contexto
// viejo -- se descarta sola después de un rato de inactividad, en vez de
// quedar "pegada" indefinidamente.
const HORAS_EXPIRACION_SESION = 6;

export async function obtenerSesion(numeroCliente: string): Promise<{ fase: FaseCotizacionAmg; datos: BorradorCotizacionAmg } | null> {
  const fila = await db.sesionCotizacionAmg.findUnique({ where: { numeroCliente } });
  if (!fila) return null;

  const horasInactiva = (Date.now() - fila.actualizadoEn.getTime()) / (1000 * 60 * 60);
  if (horasInactiva > HORAS_EXPIRACION_SESION) {
    await db.sesionCotizacionAmg.delete({ where: { numeroCliente } }).catch(() => {});
    return null;
  }

  return { fase: fila.fase as FaseCotizacionAmg, datos: fila.datos as unknown as BorradorCotizacionAmg };
}

export async function guardarSesion(
  numeroCliente: string,
  fase: FaseCotizacionAmg,
  datos: BorradorCotizacionAmg,
): Promise<void> {
  await db.sesionCotizacionAmg.upsert({
    where: { numeroCliente },
    update: { fase, datos: datos as any },
    create: { numeroCliente, fase, datos: datos as any },
  });
}

export async function borrarSesion(numeroCliente: string): Promise<void> {
  await db.sesionCotizacionAmg.deleteMany({ where: { numeroCliente } });
}
