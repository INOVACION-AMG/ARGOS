import { amgSupabase } from '../../integrations/amgSupabase';
import { conReintento } from '../../utils/reintentar';
import type { ItemPedidoAmg, ProductoCatalogoAmg } from '../../ai/ordersAmg';
import { generarCotizacionPdfBuffer } from '../../pdf/generarCotizacionPdf';
import { TIEMPO_EJECUCION_DEFAULT } from '../../pdf/constantesCotizacion';

// Igual a AMG-LEGION src/lib/constants/cotizacion.ts (IVA_RATE) -- repos
// separados, se mantiene el mismo valor a mano.
const IVA_RATE = 0.19;
// Regla del jefe: cuenta de cobro lleva este recargo adicional sobre el
// subtotal, además del IVA; factura electrónica no lo lleva.
const RECARGO_CUENTA_COBRO = 0.3;

const BUCKET_COTIZACIONES = 'cotizaciones';

export interface ItemParaTotales {
  nombre: string;
  cantidad: number;
  precioUnitario: number; // precio base, SIN ajuste de tarifa aplicado
}

export interface ItemCotizacionCalculado {
  nombre: string;
  cantidad: number;
  valorUnitario: number; // con ajuste aplicado, ya redondeado
  valorTotal: number; // ya redondeado
}

export interface TotalesCotizacion {
  items: ItemCotizacionCalculado[];
  subtotal: number;
  recargo: number;
  iva: number;
  total: number;
}

// Único lugar que calcula subtotal/recargo/IVA/total de una cotización AMG.
// Lo usan tanto el resumen que se muestra por WhatsApp antes de aprobar
// (formatearResumen en whatsapp/messageRouter.ts) como la creación real de
// la cotización (finalizarCotizacion, más abajo en este mismo archivo) --
// antes cada uno redondeaba a su manera y podían quedar desincronizados por
// unos pesos con metraje o ajustes de tarifa. Redondea el precio unitario
// ajustado y el total POR ÍTEM primero, y solo después suma esos totales ya
// redondeados para el subtotal (nunca sumar precios sin redondear y
// redondear el resultado al final -- eso es lo que causaba el desfase).
export function calcularTotalesCotizacion(
  items: ItemParaTotales[],
  ajustePorcentaje: number,
  esCuentaCobro: boolean,
): TotalesCotizacion {
  const itemsCalculados: ItemCotizacionCalculado[] = items.map((it) => {
    const valorUnitario = Math.round(it.precioUnitario * (1 + ajustePorcentaje / 100));
    const valorTotal = Math.round(it.cantidad * valorUnitario);
    return { nombre: it.nombre, cantidad: it.cantidad, valorUnitario, valorTotal };
  });

  const subtotal = itemsCalculados.reduce((acc, it) => acc + it.valorTotal, 0);
  const recargo = esCuentaCobro ? Math.round(subtotal * RECARGO_CUENTA_COBRO) : 0;
  const iva = Math.round(subtotal * IVA_RATE);
  const total = subtotal + recargo + iva;

  return { items: itemsCalculados, subtotal, recargo, iva, total };
}

export interface ItemCotizacionConfirmado {
  producto: string;
  cantidad: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface CotizacionAmgCreada {
  id: string;
  consecutivo: number;
  items: ItemCotizacionConfirmado[];
  subtotal: number;
  recargo: number;
  iva: number;
  total: number;
  // undefined si la cotización se creó bien pero el PDF falló -- no se
  // aborta la cotización por eso (ya quedó guardada y sirve igual desde la
  // app web), simplemente no hay nada que mandar por WhatsApp esta vez.
  pdfBuffer?: Buffer;
}

// Para cuando el jefe pide que le reenvíen una cotización ya hecha (ver
// interpretarSolicitudHistorial en ai/flujoCotizacionAmg.ts) -- el PDF ya
// quedó subido a este bucket al crearla, no hace falta regenerarlo.
export async function obtenerPdfCotizacion(cotizacionId: string): Promise<{ pdfBuffer: Buffer; consecutivo: number } | null> {
  const supabase = amgSupabase();

  const { data: fila, error: errFila } = await supabase.from('cotizaciones').select('consecutivo').eq('id', cotizacionId).maybeSingle();
  if (errFila || !fila) {
    console.error(`No se encontró la cotización ${cotizacionId}:`, errFila?.message);
    return null;
  }

  const { data, error } = await supabase.storage.from(BUCKET_COTIZACIONES).download(`${cotizacionId}/cotizacion.pdf`);
  if (error || !data) {
    console.error(`No se pudo descargar el PDF de la cotización ${cotizacionId}:`, error?.message);
    return null;
  }

  return { pdfBuffer: Buffer.from(await data.arrayBuffer()), consecutivo: fila.consecutivo as number };
}

async function obtenerNombreAsesor(comercialId: string): Promise<string> {
  const { data } = await amgSupabase().from('profiles').select('full_name').eq('id', comercialId).maybeSingle();
  return data?.full_name ?? 'AMG';
}

async function obtenerOCrearClienteAmg(numeroWhatsapp: string, nombre: string): Promise<string> {
  const supabase = amgSupabase();

  const { data: existente, error: errBusqueda } = await supabase
    .from('clientes')
    .select('id')
    .eq('telefono', numeroWhatsapp)
    .maybeSingle();
  if (errBusqueda) throw new Error(`No se pudo buscar el cliente en AMG: ${errBusqueda.message}`);
  if (existente) return existente.id as string;

  const { data: creado, error: errCrear } = await supabase
    .from('clientes')
    .insert({ nombre, telefono: numeroWhatsapp, created_by: process.env.AMG_COMERCIAL_ID })
    .select('id')
    .single();
  if (errCrear || !creado) throw new Error(`No se pudo crear el cliente en AMG: ${errCrear?.message}`);
  return creado.id as string;
}

// Crea la cotización directo en el Supabase de AMG-LEGION, como si el
// cliente la hubiera hecho un comercial en el cotizador web. Devuelve null
// si ningún ítem del mensaje coincidió con el catálogo (nada que cotizar).
export async function crearCotizacionAmg(
  numeroWhatsapp: string,
  nombreCliente: string,
  items: ItemPedidoAmg[],
  catalogo: ProductoCatalogoAmg[],
  // Llave estable para que un reintento (ej. Green API redelivera el mismo
  // mensaje) no cree una segunda cotización -- usar un id que ya exista y no
  // cambie entre reintentos (ej. SolicitudProductoAmg.id), nunca un
  // randomUUID() generado de nuevo en cada llamada.
  idempotencyKey: string,
): Promise<CotizacionAmgCreada | null> {
  const confirmados: ItemCotizacionConfirmado[] = [];
  const itemsPayload: ItemPayloadCotizacion[] = [];

  items.forEach((item, i) => {
    const producto = catalogo.find((p) => p.id === item.productoId);
    if (!producto || item.cantidad <= 0) return;

    const valorTotal = Math.round(item.cantidad * producto.precio);
    confirmados.push({
      producto: producto.nombre,
      cantidad: item.cantidad,
      valorUnitario: producto.precio,
      valorTotal,
    });
    itemsPayload.push({
      producto_id: producto.id,
      descripcion: producto.nombre,
      tipo: producto.tipo,
      cantidad: item.cantidad,
      valor_unitario: producto.precio,
      valor_total: valorTotal,
      orden: i,
    });
  });

  if (confirmados.length === 0) return null;

  return crearCotizacionDesdeConfirmados(numeroWhatsapp, nombreCliente, confirmados, itemsPayload, false, idempotencyKey);
}

export interface ItemResueltoAmg {
  productoId: string;
  nombre: string;
  cantidad: number;
  valorUnitario: number;
  tipo: 'suministro' | 'mano_obra';
}

// Igual que crearCotizacionAmg, pero para el flujo guiado (Fases 1-5): ahí
// los ítems ya vienen resueltos y con precio ajustado por tarifa de cliente
// (ver flujoCotizacionAmg.ts) -- no hace falta volver a buscarlos en el
// catálogo, solo guardarlos tal cual.
export async function crearCotizacionAmgDesdeItemsResueltos(
  numeroWhatsapp: string,
  nombreCliente: string,
  items: ItemResueltoAmg[],
  esCuentaCobro: boolean,
  // Generada UNA sola vez por intento de finalización y persistida en
  // BorradorCotizacionAmg.idempotencyKey -- nunca generar una nueva acá.
  idempotencyKey: string,
): Promise<CotizacionAmgCreada | null> {
  if (items.length === 0) return null;

  const confirmados: ItemCotizacionConfirmado[] = items.map((it) => ({
    producto: it.nombre,
    cantidad: it.cantidad,
    valorUnitario: it.valorUnitario,
    valorTotal: Math.round(it.cantidad * it.valorUnitario),
  }));

  const itemsPayload: ItemPayloadCotizacion[] = items.map((it, i) => ({
    producto_id: it.productoId,
    descripcion: it.nombre,
    tipo: it.tipo,
    cantidad: it.cantidad,
    valor_unitario: it.valorUnitario,
    valor_total: Math.round(it.cantidad * it.valorUnitario),
    orden: i,
  }));

  return crearCotizacionDesdeConfirmados(numeroWhatsapp, nombreCliente, confirmados, itemsPayload, esCuentaCobro, idempotencyKey);
}

interface ItemPayloadCotizacion {
  producto_id: string;
  descripcion: string;
  tipo: string;
  cantidad: number;
  valor_unitario: number;
  valor_total: number;
  orden: number;
}

async function crearCotizacionDesdeConfirmados(
  numeroWhatsapp: string,
  nombreCliente: string,
  confirmados: ItemCotizacionConfirmado[],
  itemsPayload: ItemPayloadCotizacion[],
  esCuentaCobro: boolean = false,
  idempotencyKey?: string,
): Promise<CotizacionAmgCreada | null> {
  const comercialId = process.env.AMG_COMERCIAL_ID;
  if (!comercialId) {
    throw new Error(
      'Falta AMG_COMERCIAL_ID en .env: es el perfil de AMG-LEGION al que se le atribuyen las cotizaciones que crea el bot. Ver MODO-AMG.md.',
    );
  }

  const clienteId = await obtenerOCrearClienteAmg(numeroWhatsapp, nombreCliente);

  // Suma valorTotal (ya redondeado por ítem), no cantidad*valorUnitario en
  // crudo -- con cantidades fraccionarias (metraje) esas dos cosas pueden
  // diferir por unos pesos, y este subtotal es el que de verdad se guarda y
  // se factura, así que debe coincidir con lo que ya se le mostró al jefe en
  // el resumen (ver formatearResumen en whatsapp/messageRouter.ts).
  const subtotal = confirmados.reduce((acc, i) => acc + i.valorTotal, 0);
  // Regla del jefe: cuenta de cobro lleva un recargo del 30% del valor
  // inicial además del 19%; factura electrónica solo lleva el 19%.
  const recargo = esCuentaCobro ? Math.round(subtotal * RECARGO_CUENTA_COBRO) : 0;
  const iva = Math.round(subtotal * IVA_RATE);
  const total = subtotal + recargo + iva;

  const supabase = amgSupabase();
  // Con idempotencyKey se llama a la sobrecarga de 11 argumentos (migración
  // 0013 en AMG-LEGION), que reutiliza una cotización ya creada con la misma
  // llave en vez de duplicarla. Sin ella (llamadores que todavía no la
  // tengan), Postgres resuelve la sobrecarga original de 10 argumentos.
  const { data: cotizaciones, error: errCotizacion } = await supabase.rpc('crear_cotizacion_con_items', {
    p_cliente_id: clienteId,
    p_comercial_id: comercialId,
    p_lugar: '',
    p_vigencia_dias: 15,
    p_tiempo_ejecucion: TIEMPO_EJECUCION_DEFAULT,
    p_subtotal: subtotal,
    p_recargo: recargo,
    p_iva: iva,
    p_total: total,
    p_items: itemsPayload,
    ...(idempotencyKey ? { p_idempotency_key: idempotencyKey } : {}),
  });
  const cotizacion = cotizaciones?.[0];
  if (errCotizacion || !cotizacion) {
    throw new Error(`No se pudo crear la cotización en AMG: ${errCotizacion?.message}`);
  }

  const consecutivo = cotizacion.consecutivo as number;
  let pdfBuffer: Buffer | undefined;

  try {
    const asesor = await obtenerNombreAsesor(comercialId);
    pdfBuffer = await generarCotizacionPdfBuffer({
      consecutivo,
      cliente: nombreCliente,
      asesor,
      items: confirmados.map((c, i) => ({
        id: itemsPayload[i].producto_id,
        descripcion: c.producto,
        tipo: itemsPayload[i].tipo as 'suministro' | 'mano_obra',
        cantidad: c.cantidad,
        valorUnitario: c.valorUnitario,
      })),
      subtotal,
      recargo,
      iva,
      total,
    });

    const pdfPath = `${cotizacion.id}/cotizacion.pdf`;
    // upsert:true hace que subir el mismo PDF dos veces sea inofensivo --
    // seguro reintentar si Supabase falla por una razón transitoria.
    await conReintento(async () => {
      const { error: errUpload } = await supabase.storage
        .from(BUCKET_COTIZACIONES)
        .upload(pdfPath, pdfBuffer!, { contentType: 'application/pdf', upsert: true });
      if (errUpload) throw new Error(errUpload.message);
    });

    await supabase.from('cotizaciones').update({ pdf_path: pdfPath, estado: 'generada' }).eq('id', cotizacion.id);
  } catch (err) {
    // La cotización ya quedó guardada y es válida sin PDF -- no se revierte
    // por esto. El llamador decide qué avisar si pdfBuffer viene vacío.
    console.error('No se pudo generar/subir el PDF de la cotización AMG:', err);
    pdfBuffer = undefined;
  }

  return {
    id: cotizacion.id as string,
    consecutivo,
    items: confirmados,
    subtotal,
    recargo,
    iva,
    total,
    pdfBuffer,
  };
}
