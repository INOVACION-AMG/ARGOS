import { pdf } from '@react-pdf/renderer';
import CotizacionPdfDocument, { type ItemPdf } from './CotizacionPdfDocument';
import { VIGENCIA_DIAS_DEFAULT, TIEMPO_EJECUCION_DEFAULT } from './constantesCotizacion';

export interface DatosCotizacionPdf {
  consecutivo: number;
  cliente: string;
  asesor: string;
  items: ItemPdf[];
  subtotal: number;
  iva: number;
  total: number;
  lugar?: string;
  aplicaIva?: boolean;
}

export async function generarCotizacionPdfBuffer(datos: DatosCotizacionPdf): Promise<Buffer> {
  const consecutivoLabel = String(datos.consecutivo).padStart(3, '0');
  const fecha = new Date().toLocaleDateString('es-CO');

  const documento = CotizacionPdfDocument({
    consecutivo: consecutivoLabel,
    fecha,
    lugar: datos.lugar ?? '',
    cliente: datos.cliente,
    asesor: datos.asesor,
    vigenciaDias: VIGENCIA_DIAS_DEFAULT,
    tiempoEjecucion: TIEMPO_EJECUCION_DEFAULT,
    items: datos.items,
    subtotal: datos.subtotal,
    iva: datos.iva,
    total: datos.total,
    aplicaIva: datos.aplicaIva,
  });

  // instancia.toBuffer() no devuelve un Buffer ya armado -- devuelve el
  // stream de PDFKit subyacente (PDFDocument), hay que juntarlo a mano.
  const instancia = pdf(documento);
  const stream = (await instancia.toBuffer()) as unknown as NodeJS.ReadableStream;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
