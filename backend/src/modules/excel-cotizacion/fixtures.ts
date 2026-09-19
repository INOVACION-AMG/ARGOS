import * as XLSX from "xlsx";

// Fixtures sintéticas para los tests -- misma estructura exacta que la
// plantilla real de Fernando (ver comentario en parsearCotizacionExcel),
// pero con datos inventados. No se suben los Excel reales al repo (público)
// porque traen catálogo de precios y clientes reales del negocio.

function filaVacia(largo = 12): string[] {
  return Array(largo).fill("");
}

function hojaCotizacion(rows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

export function construirWorkbookSinIva(): Buffer {
  const rows: unknown[][] = [
    filaVacia(),
    ["FECHA", 46284, "", "", "", "COTIZACION :", "", "001"],
    ["LUGAR ", "BOGOTA"],
    filaVacia(),
    ["CLIENTE ", "CLIENTE DE PRUEBA"],
    ["ASESOR", "ASESOR DE PRUEBA"],
    filaVacia(),
    filaVacia(),
    filaVacia(),
    filaVacia(),
    filaVacia(),
    ["", "", "ITEM", "DESCRIPCION", "", "", "", "CANT", "VALOR UNITARIO", "TOTAL"],
    ["", "MANTENIMIENTO", 1, "ITEM DE PRUEBA UNO", "", "", "", 1, 365000, 365000],
    ["", "", 2, "ITEM DE PRUEBA DOS", "", "", "", 1, 600000, 600000],
    ["", "MANO DE OBRA", 3, "MANO DE OBRA DE PRUEBA", "", "", "", 1, 180000, 180000],
    ["", "VALOR BASE", "", "", "", "", "", "", "", 1145000],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaCotizacion(rows), "COTIZACION");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function construirWorkbookConIva(): Buffer {
  const rows: unknown[][] = [
    filaVacia(),
    ["FECHA", 46284, "", "", "", "COTIZACION :", "", "001"],
    ["LUGAR ", "BOGOTA"],
    filaVacia(),
    ["CLIENTE ", "CONJUNTO DE PRUEBA"],
    ["ASESOR", "ASESOR DE PRUEBA"],
    filaVacia(),
    filaVacia(),
    filaVacia(),
    filaVacia(),
    filaVacia(),
    ["", "", "ITEM", "DESCRIPCION", "", "", "", "CANT", "VALOR UNITARIO", "TOTAL"],
    ["", "SUMINISTROS CCTV", 1, "ITEM CCTV UNO", "", "", "", 1, 1000000, 1000000],
    ["", "", 2, "ITEM CCTV DOS", "", "", "", 2, 500000, 1000000],
    ["", "MANO DE OBRA", 3, "MANO DE OBRA DE PRUEBA", "", "", "", 1, 500000, 500000],
    ["", "OPCION 1", "VALOR BASE", "", "", "", "", "", "", 2500000],
    ["", "", "VALOR IVA 19%", "", "", "", "", "", "", 475000],
    ["", "", "VALOR TOTAL", "", "", "", "", "", "", 2975000],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaCotizacion(rows), "COTIZACION");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
