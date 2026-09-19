import * as XLSX from "xlsx";

export interface ItemCotizacionExcel {
  categoria: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  total: number;
}

export interface CotizacionExcelParseada {
  cliente: string | null;
  asesor: string | null;
  items: ItemCotizacionExcel[];
  valorBase: number;
  valorIva: number | null;
  valorTotal: number | null;
  tieneIva: boolean;
}

function normalizar(valor: unknown): string {
  return String(valor ?? "").trim().toUpperCase();
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

// Fernando arma todas sus cotizaciones con la misma plantilla reutilizable
// (hoja "COTIZACION"): CLIENTE/ASESOR arriba, una fila de encabezados
// ITEM/DESCRIPCION/CANT/VALOR UNITARIO/TOTAL, filas de ítems agrupadas por
// categoría (la categoría solo aparece en la primera fila del grupo, una
// columna a la izquierda de ITEM), y termina en una fila "VALOR BASE" --
// a veces seguida de "VALOR IVA 19%" y "VALOR TOTAL" (cotización formal de
// empresa) y a veces no (cuenta de cobro personal, sin IVA). Esa presencia o
// ausencia de las filas de IVA es justamente lo que distingue el formato,
// no hace falta preguntarlo si el Excel ya lo trae claro.
export function parsearCotizacionExcel(buffer: Buffer): CotizacionExcelParseada | null {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const nombreHoja =
    wb.SheetNames.find((n) => normalizar(n) === "COTIZACION") ??
    wb.SheetNames.find((n) => normalizar(n).includes("COTIZACION")) ??
    wb.SheetNames[0];
  if (!nombreHoja) return null;

  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombreHoja], { header: 1, defval: "" });

  let cliente: string | null = null;
  let asesor: string | null = null;
  for (const fila of filas) {
    const etiqueta = normalizar(fila[0]);
    if (etiqueta.startsWith("CLIENTE") && !cliente) {
      cliente = String(fila.find((c, i) => i > 0 && String(c).trim()) ?? "").trim() || null;
    }
    if (etiqueta.startsWith("ASESOR") && !asesor) {
      asesor = String(fila.find((c, i) => i > 0 && String(c).trim()) ?? "").trim() || null;
    }
  }

  const idxHeader = filas.findIndex((fila) => fila.some((c) => normalizar(c) === "ITEM") && fila.some((c) => normalizar(c).startsWith("DESCRIPCION")));
  if (idxHeader === -1) return null;
  const header = filas[idxHeader];

  const colItem = header.findIndex((c) => normalizar(c) === "ITEM");
  const colDescripcion = header.findIndex((c) => normalizar(c).startsWith("DESCRIPCION"));
  const colCant = header.findIndex((c) => normalizar(c).startsWith("CANT"));
  const colValorUnit = header.findIndex((c) => normalizar(c).startsWith("VALOR UNITARIO"));
  const colTotal = header.findIndex((c) => normalizar(c) === "TOTAL");
  const colCategoria = colItem - 1;
  if ([colItem, colDescripcion, colCant, colValorUnit, colTotal].some((c) => c < 0) || colCategoria < 0) return null;

  const items: ItemCotizacionExcel[] = [];
  let categoriaActual = "";
  let valorBase: number | null = null;
  let valorIva: number | null = null;
  let valorTotal: number | null = null;

  for (let i = idxHeader + 1; i < filas.length; i++) {
    const fila = filas[i];
    const etiquetaCategoria = normalizar(fila[colCategoria]);
    const etiquetaItemCol = normalizar(fila[colItem]);
    // El label de cierre ("VALOR BASE"/"VALOR IVA"/"VALOR TOTAL") puede caer
    // en la columna de categoría o en la de ITEM según la variante de la
    // plantilla -- y la fila de VALOR BASE a veces trae "OPCION 1" en la
    // columna de categoría al mismo tiempo, así que hay que revisar las dos
    // columnas de forma independiente, no una como respaldo de la otra.
    const etiquetaCierre = [etiquetaCategoria, etiquetaItemCol].find((e) => e.startsWith("VALOR")) ?? "";

    if (etiquetaCierre === "VALOR BASE") {
      const val = fila[colTotal];
      valorBase = esNumero(val) ? val : null;
      continue;
    }
    if (etiquetaCierre.startsWith("VALOR IVA")) {
      const val = fila[colTotal];
      valorIva = esNumero(val) ? val : null;
      continue;
    }
    if (etiquetaCierre.startsWith("VALOR TOTAL")) {
      const val = fila[colTotal];
      valorTotal = esNumero(val) ? val : null;
      break; // no hay nada útil después de esto
    }
    if (valorBase !== null) continue; // ya pasamos el cierre de la tabla, ignora ruido (condiciones, garantía, etc.)

    if (etiquetaCategoria && !etiquetaCategoria.startsWith("SUB TOTAL") && !etiquetaCategoria.startsWith("SUBTOTAL") && etiquetaCategoria !== "OPCION 1") {
      categoriaActual = String(fila[colCategoria]).trim();
    }

    const esFilaItem = esNumero(fila[colItem]) || (typeof fila[colItem] === "string" && /^\d+$/.test(String(fila[colItem]).trim()));
    if (!esFilaItem) continue;
    const descripcion = String(fila[colDescripcion] ?? "").trim();
    if (!descripcion) continue;

    items.push({
      categoria: categoriaActual || "GENERAL",
      descripcion,
      cantidad: esNumero(fila[colCant]) ? fila[colCant] : 1,
      valorUnitario: esNumero(fila[colValorUnit]) ? fila[colValorUnit] : 0,
      total: esNumero(fila[colTotal]) ? fila[colTotal] : 0,
    });
  }

  if (items.length === 0 || valorBase === null) return null;

  return {
    cliente,
    asesor,
    items,
    valorBase,
    valorIva,
    valorTotal,
    tieneIva: valorIva !== null,
  };
}
