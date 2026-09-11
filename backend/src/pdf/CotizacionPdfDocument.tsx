import { Document, Page, View, Text, StyleSheet, Svg, Polygon } from '@react-pdf/renderer';
import {
  FORMA_PAGO,
  CONSIDERACIONES,
  GARANTIA_TEXTO,
  GARANTIA_EXCLUSIONES,
  AMG_CONTACTO,
  formatCOP,
} from './constantesCotizacion';

// Copia de src/lib/pdf/CotizacionPdfDocument.tsx de AMG-LEGION -- mismo
// diseño visual, adaptado al tipo de ítem que produce el bot (ver
// cotizaciones-amg/service.ts) en vez de CartItem del cotizador web.
// Mantener el diseño en sync a mano si cambia allá.

const NAVY = '#0A1930';
const GOLD = '#F6C42B';
const GOLD_DARK = '#D9A625';

const PAGE_W = 612;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 24,
    paddingHorizontal: MARGIN,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
  },
  bannerWrap: {
    marginHorizontal: -MARGIN,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 6,
  },
  infoCell: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  infoLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 9,
  },
  sectionBar: {
    backgroundColor: GOLD,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sectionBarText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  sectionBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#222',
    padding: 8,
    marginBottom: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: '#222',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: GOLD,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#222',
    minHeight: 18,
  },
  th: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    padding: 4,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  td: {
    fontSize: 8,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  totalsBlock: {
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  totalsRowFinal: {
    backgroundColor: GOLD,
  },
  totalsLabel: {
    width: 140,
    padding: 5,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  totalsValue: {
    width: 110,
    padding: 5,
    fontSize: 9,
    textAlign: 'right',
  },
});

const COL_W = { item: 30, desc: 250, cant: 40, valor: 100, total: CONTENT_W - 30 - 250 - 40 - 100 };

function PdfHeaderBanner({ titleLine1, titleLine2 }: { titleLine1: string; titleLine2: string }) {
  const h = 60;
  return (
    <View style={styles.bannerWrap}>
      <View style={{ height: h, position: 'relative' }}>
        <Svg width={PAGE_W} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Polygon points={`0,0 260,0 195,${h} 0,${h}`} fill={NAVY} />
          <Polygon points={`210,0 ${PAGE_W},0 ${PAGE_W},${h} 150,${h}`} fill={GOLD} />
          <Polygon points={`210,0 260,0 195,${h} 150,${h}`} fill={GOLD_DARK} />
        </Svg>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: h,
            justifyContent: 'center',
            paddingLeft: 14,
          }}
        >
          <Text style={{ color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 14 }}>{titleLine1}</Text>
          <Text style={{ color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 14 }}>{titleLine2}</Text>
        </View>
      </View>
    </View>
  );
}

function PdfFooterBanner() {
  const h = 22;
  return (
    <View style={{ marginHorizontal: -MARGIN, marginTop: 10 }}>
      <Svg width={PAGE_W} height={h}>
        <Polygon points={`70,${h} 160,0 220,0 130,${h}`} fill={GOLD} />
        <Polygon points={`0,${h} 90,0 145,0 55,${h}`} fill={NAVY} />
        <Polygon points={`260,${h} 320,0 ${PAGE_W},0 ${PAGE_W},${h}`} fill={NAVY} />
      </Svg>
    </View>
  );
}

function InfoBlock({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoCell, last ? { borderRightWidth: 0 } : {}]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export interface ItemPdf {
  id: string;
  descripcion: string;
  tipo: 'suministro' | 'mano_obra';
  cantidad: number;
  valorUnitario: number;
}

function ItemsTable({ title, items }: { title: string; items: ItemPdf[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.sectionBar}>
        <Text style={styles.sectionBarText}>{title}</Text>
      </View>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.th, { width: COL_W.item }]}>ITEM</Text>
          <Text style={[styles.th, { width: COL_W.desc }]}>DESCRIPCIÓN</Text>
          <Text style={[styles.th, { width: COL_W.cant }]}>CANT</Text>
          <Text style={[styles.th, { width: COL_W.valor }]}>VALOR UNITARIO</Text>
          <Text style={[styles.th, { width: COL_W.total, borderRightWidth: 0 }]}>TOTAL</Text>
        </View>
        {items.map((it, i) => (
          <View style={styles.tableRow} key={it.id}>
            <Text style={[styles.td, { width: COL_W.item, textAlign: 'center' }]}>{i + 1}</Text>
            <Text style={[styles.td, { width: COL_W.desc }]}>{it.descripcion}</Text>
            <Text style={[styles.td, { width: COL_W.cant, textAlign: 'center' }]}>{it.cantidad}</Text>
            <Text style={[styles.td, { width: COL_W.valor, textAlign: 'right' }]}>
              {formatCOP(it.valorUnitario)}
            </Text>
            <Text style={[styles.td, { width: COL_W.total, textAlign: 'right', borderRightWidth: 0 }]}>
              {formatCOP(it.cantidad * it.valorUnitario)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface CotizacionPdfDocumentProps {
  consecutivo: string;
  fecha: string;
  lugar: string;
  cliente: string;
  asesor: string;
  vigenciaDias: number;
  tiempoEjecucion: string;
  items: ItemPdf[];
  subtotal: number;
  recargo?: number;
  iva: number;
  total: number;
}

export default function CotizacionPdfDocument({
  consecutivo,
  fecha,
  lugar,
  cliente,
  asesor,
  vigenciaDias,
  tiempoEjecucion,
  items,
  subtotal,
  recargo = 0,
  iva,
  total,
}: CotizacionPdfDocumentProps) {
  const suministros = items.filter((it) => it.tipo === 'suministro');
  const manoObra = items.filter((it) => it.tipo === 'mano_obra');

  return (
    <Document title={`Cotizacion ${consecutivo} - ${cliente}`}>
      <Page size="LETTER" style={styles.page}>
        <PdfHeaderBanner titleLine1="COTIZACION" titleLine2={`N° ${consecutivo}`} />

        <View style={styles.infoRow}>
          <InfoBlock label="FECHA" value={fecha} />
          <InfoBlock label="LUGAR" value={lugar || '-'} />
          <InfoBlock label="CLIENTE" value={cliente} last />
        </View>
        <View style={styles.infoRow}>
          <InfoBlock label="ASESOR" value={asesor} />
          <InfoBlock label="VIGENCIA" value={`${vigenciaDias} días calendario`} />
          <InfoBlock label="TIEMPO DE EJECUCIÓN" value={tiempoEjecucion || '-'} last />
        </View>

        <Text style={{ fontSize: 9, marginBottom: 10, lineHeight: 1.4 }}>
          Respetados Señores{'\n'}
          Este documento tiene como finalidad presentar la propuesta solicitada.
        </Text>

        <ItemsTable title="Suministro" items={suministros} />
        <ItemsTable title="Mano de obra" items={manoObra} />

        <View style={styles.totalsBlock}>
          <View style={[styles.totalsRow, { borderTopWidth: 0 }]}>
            <Text style={styles.totalsLabel}>VALOR BASE</Text>
            <Text style={styles.totalsValue}>{formatCOP(subtotal)}</Text>
          </View>
          {recargo > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>RECARGO 30%</Text>
              <Text style={styles.totalsValue}>{formatCOP(recargo)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>VALOR IVA 19%</Text>
            <Text style={styles.totalsValue}>{formatCOP(iva)}</Text>
          </View>
          <View style={[styles.totalsRow, styles.totalsRowFinal]}>
            <Text style={styles.totalsLabel}>VALOR TOTAL</Text>
            <Text style={styles.totalsValue}>{formatCOP(total)}</Text>
          </View>
        </View>

        <Text style={{ fontSize: 8, marginBottom: 4, lineHeight: 1.3 }}>
          Observaciones: Esta cotización está sujeta a cambios por cantidades de dispositivos,
          materiales e infraestructura del sitio, tiempos de ejecución del proyecto y tiempo de
          aprobación por incremento de equipos, materiales e insumos.
        </Text>

        <View style={styles.sectionBar}>
          <Text style={styles.sectionBarText}>Condiciones comerciales</Text>
        </View>
        <View style={styles.sectionBody}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>FORMA DE PAGO:</Text>
          {FORMA_PAGO.map((line, i) => (
            <Text key={i} style={{ fontSize: 8, marginBottom: 2 }}>
              - {line}
            </Text>
          ))}
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 4, marginBottom: 3 }}>
            CONSIDERACIONES:
          </Text>
          {CONSIDERACIONES.map((line, i) => (
            <Text key={i} style={{ fontSize: 8, marginBottom: 2 }}>
              - {line}
            </Text>
          ))}
        </View>

        <PdfFooterBanner />
        <Text style={{ fontSize: 7, textAlign: 'center', marginTop: 4, color: '#555' }}>
          {AMG_CONTACTO.direccion} · {AMG_CONTACTO.telefonos} · {AMG_CONTACTO.correos}
        </Text>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PdfHeaderBanner titleLine1="COTIZACION" titleLine2={`N° ${consecutivo}`} />

        <View style={styles.sectionBar}>
          <Text style={styles.sectionBarText}>Garantía</Text>
        </View>
        <View style={styles.sectionBody}>
          <Text style={{ fontSize: 8, lineHeight: 1.4, marginBottom: 6 }}>{GARANTIA_TEXTO}</Text>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
            Dentro de la garantía no están contemplados los siguientes aspectos:
          </Text>
          {GARANTIA_EXCLUSIONES.map((line, i) => (
            <Text key={i} style={{ fontSize: 8, marginBottom: 2 }}>
              - {line}
            </Text>
          ))}
        </View>

        <Text style={{ fontSize: 9, marginTop: 20 }}>Quedo atento a cualquier inquietud.</Text>
        <Text style={{ fontSize: 9, marginTop: 20 }}>Atentamente,</Text>
        <Text style={{ fontSize: 9, marginTop: 30 }}>{asesor}</Text>

        <PdfFooterBanner />
      </Page>
    </Document>
  );
}
