import { amgSupabase } from '../../integrations/amgSupabase';
import type { ItemPedidoAmg, ProductoCatalogoAmg } from '../../ai/ordersAmg';
import { generarCotizacionPdfBuffer } from '../../pdf/generarCotizacionPdf';
import { TIEMPO_EJECUCION_DEFAULT } from '../../pdf/constantesCotizacion';

// Igual a AMG-LEGION src/lib/constants/cotizacion.ts (IVA_RATE) -- repos
// separados, se mantiene el mismo valor a mano.
const IVA_RATE = 0.19;

const BUCKET_COTIZACIONES = 'cotizaciones';

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

  return crearCotizacionDesdeConfirmados(numeroWhatsapp, nombreCliente, confirmados, itemsPayload);
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
  aplicaIva: boolean = true,
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

  return crearCotizacionDesdeConfirmados(numeroWhatsapp, nombreCliente, confirmados, itemsPayload, aplicaIva);
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
  aplicaIva: boolean = true,
): Promise<CotizacionAmgCreada | null> {
  const comercialId = process.env.AMG_COMERCIAL_ID;
  if (!comercialId) {
    throw new Error(
      'Falta AMG_COMERCIAL_ID en .env: es el perfil de AMG-LEGION al que se le atribuyen las cotizaciones que crea el bot. Ver MODO-AMG.md.',
    );
  }

  const clienteId = await obtenerOCrearClienteAmg(numeroWhatsapp, nombreCliente);

  const subtotal = confirmados.reduce((acc, i) => acc + i.cantidad * i.valorUnitario, 0);
  const iva = aplicaIva ? Math.round(subtotal * IVA_RATE) : 0;
  const total = subtotal + iva;

  const supabase = amgSupabase();
  const { data: cotizacion, error: errCotizacion } = await supabase
    .from('cotizaciones')
    .insert({
      cliente_id: clienteId,
      comercial_id: comercialId,
      subtotal,
      iva,
      total,
      tiempo_ejecucion: TIEMPO_EJECUCION_DEFAULT,
    })
    .select('id, consecutivo')
    .single();
  if (errCotizacion || !cotizacion) {
    throw new Error(`No se pudo crear la cotización en AMG: ${errCotizacion?.message}`);
  }

  const { error: errItems } = await supabase
    .from('cotizacion_items')
    .insert(itemsPayload.map((it) => ({ ...it, cotizacion_id: cotizacion.id })));
  if (errItems) {
    // Sin transacción entre los dos inserts (igual que en AMG-LEGION) --
    // revertimos el encabezado si fallan los ítems para no dejar una
    // cotización fantasma sin nada adentro.
    await supabase.from('cotizaciones').delete().eq('id', cotizacion.id);
    throw new Error(`No se pudieron guardar los ítems de la cotización en AMG: ${errItems.message}`);
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
      iva,
      total,
      aplicaIva,
    });

    const pdfPath = `${cotizacion.id}/cotizacion.pdf`;
    const { error: errUpload } = await supabase.storage
      .from(BUCKET_COTIZACIONES)
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    if (errUpload) throw new Error(errUpload.message);

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
    iva,
    total,
    pdfBuffer,
  };
}
