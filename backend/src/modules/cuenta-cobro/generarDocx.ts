import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
  Packer,
} from "docx";
import { numeroALetras } from "../../lib/numeroALetras";
import type { ItemCotizacionExcel } from "../excel-cotizacion/service";

const ASSETS_DIR = join(process.cwd(), "src/assets/cuenta-cobro");
const GOLD = "F6C42B";
const NAVY = "0A1930";

function formatoCOP(valor: number): string {
  return `$${Math.round(valor).toLocaleString("es-CO")}`;
}

function celda(texto: string, opciones: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; shading?: string; color?: string } = {}): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: opciones.shading ? { fill: opciones.shading } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opciones.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text: texto, bold: opciones.bold, color: opciones.color, size: 18 })],
      }),
    ],
  });
}

function filaEncabezadoTabla(): TableRow {
  return new TableRow({
    tableHeader: true,
    children: ["ÍTEM", "DESCRIPCIÓN", "CANT", "VALOR UNITARIO", "TOTAL"].map((t) =>
      celda(t, { bold: true, align: AlignmentType.CENTER, shading: NAVY, color: "FFFFFF" }),
    ),
  });
}

function filasItems(items: ItemCotizacionExcel[]): TableRow[] {
  const filas: TableRow[] = [];
  let categoriaAnterior: string | null = null;
  items.forEach((item, i) => {
    if (item.categoria !== categoriaAnterior) {
      filas.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 5,
              shading: { fill: "EDEDED" },
              margins: { top: 40, bottom: 40, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: item.categoria, bold: true, size: 18 })] })],
            }),
          ],
        }),
      );
      categoriaAnterior = item.categoria;
    }
    filas.push(
      new TableRow({
        children: [
          celda(String(i + 1), { align: AlignmentType.CENTER }),
          celda(item.descripcion),
          celda(String(item.cantidad), { align: AlignmentType.CENTER }),
          celda(formatoCOP(item.valorUnitario), { align: AlignmentType.RIGHT }),
          celda(formatoCOP(item.total), { align: AlignmentType.RIGHT }),
        ],
      }),
    );
  });
  return filas;
}

function filaTotal(etiqueta: string, valor: number, opciones: { shading?: string; color?: string } = {}): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 4,
        shading: opciones.shading ? { fill: opciones.shading } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: etiqueta, bold: true, color: opciones.color, size: 20 })],
          }),
        ],
      }),
      celda(formatoCOP(valor), { bold: true, align: AlignmentType.RIGHT, shading: opciones.shading, color: opciones.color }),
    ],
  });
}

const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const TABLA_BORDES = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
};

export interface DatosCuentaCobroPersonal {
  numeroFa: string;
  cliente: string;
  items: ItemCotizacionExcel[];
  valorBase: number;
  fecha: Date;
}

// Replica el documento real que ya usa Fernando bajo su identidad personal
// ("F.A. Medios Tecnológicos", régimen simplificado, sin IVA) -- ver
// FA20038 CONJUNTO RESIDENCIAL VENTURA.docx, la referencia que aprobó el
// jefe. La firma se deja en blanco a propósito: Argos no debe estampar la
// firma real de Fernando en un documento que genera solo.
export async function generarCuentaCobroPersonal(datos: DatosCuentaCobroPersonal): Promise<Buffer> {
  const logo = readFileSync(join(ASSETS_DIR, "fa-logo.jpg"));
  const footer = readFileSync(join(ASSETS_DIR, "fa-footer.jpg"));
  const fechaTexto = datos.fecha.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new ImageRun({ data: logo, transformation: { width: 260, height: 65 }, type: "jpg" })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: `Bogotá ${fechaTexto},` })] }),
          new Paragraph({ children: [new TextRun({ text: "Yo, José Fernando Ávila Suarez" })] }),
          new Paragraph({
            children: [
              new TextRun({ text: "Con RUT No. 1012.388.764-9" }),
              new TextRun({ text: `\t\t\tCUENTA DE COBRO: ${datos.numeroFa}`, bold: true }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Manifiesto que:" })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: datos.cliente.toUpperCase(), bold: true })],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Bogotá – Colombia." })] }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "Me debe la suma de " }),
              new TextRun({ text: numeroALetras(datos.valorBase), bold: true }),
              new TextRun({ text: " Por concepto de;" }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: TABLA_BORDES,
            rows: [filaEncabezadoTabla(), ...filasItems(datos.items), filaTotal("VALOR BASE", datos.valorBase, { shading: NAVY, color: "FFFFFF" })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "FORMA DE PAGO:", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: "➢ Cuenta de ahorros Bancolombia No 300-776686-71." })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "CONSIDERACIONES:", bold: true })] }),
          new Paragraph({
            children: [
              new TextRun({
                text: "➢ Cualquier actividad adicional no prevista debe ser acordada previamente con el personal encargado de la copropiedad, siendo esta una actividad independiente la cual queda excluida de dicha cotización.",
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "➢ Para llevar a cabo las actividades se cuenta con personal capacitado." })] }),
          new Paragraph({
            children: [
              new TextRun({ text: "➢ ", bold: true }),
              new TextRun({ text: "DECLARANTE DE RENTA", bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Declaro voluntariamente y bajo la gravedad de juramento, que pertenezco al Régimen Simplificado, por lo tanto, de acuerdo al Art. 42 del Decreto 3541 de 1.983 y al Art. 511 del ET, no estoy obligado a expedir factura de venta.",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Firma: _______________________." })] }),
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ data: footer, transformation: { width: 420, height: 55 }, type: "jpg" })],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export interface DatosCuentaCobroEmpresa {
  numero: string;
  cliente: string;
  items: ItemCotizacionExcel[];
  valorBase: number;
  fecha: Date;
  esCuentaCobro: boolean; // true: +30% recargo +19% IVA -- false: factura electrónica, solo +19% IVA
}

// Formato empresa (Soluciones y Medios Tecnológicos AMG SAS) -- mismo cálculo
// de recargo/IVA que ya usa el flujo de cotizaciones de Fernando por
// WhatsApp (ver cotizaciones-amg/service.ts en AMG-LEGION), para que ambos
// caminos den siempre el mismo total sobre los mismos ítems.
export async function generarCuentaCobroEmpresa(datos: DatosCuentaCobroEmpresa): Promise<Buffer> {
  const recargo = datos.esCuentaCobro ? Math.round(datos.valorBase * 0.3) : 0;
  const baseConRecargo = datos.valorBase + recargo;
  const iva = Math.round(baseConRecargo * 0.19);
  const total = baseConRecargo + iva;
  const fechaTexto = datos.fecha.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  const filasTotales: TableRow[] = [filaTotal("SUBTOTAL", datos.valorBase)];
  if (recargo > 0) filasTotales.push(filaTotal("RECARGO 30%", recargo));
  filasTotales.push(filaTotal("IVA 19%", iva));
  filasTotales.push(filaTotal("TOTAL", total, { shading: GOLD }));

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "SOLUCIONES Y MEDIOS TECNOLÓGICOS AMG SAS", bold: true, size: 28, color: NAVY })],
          }),
          new Paragraph({ children: [new TextRun({ text: datos.esCuentaCobro ? "CUENTA DE COBRO" : "FACTURA ELECTRÓNICA", bold: true, color: GOLD })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: `Bogotá, ${fechaTexto}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Cliente: ${datos.cliente.toUpperCase()}`, bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: `Número: ${datos.numero}` })] }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: TABLA_BORDES,
            rows: [filaEncabezadoTabla(), ...filasItems(datos.items), ...filasTotales],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "Valor en letras: " }),
              new TextRun({ text: numeroALetras(total), bold: true }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
