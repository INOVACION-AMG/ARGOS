import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearCotizacionExcel } from "./service";
import { construirWorkbookSinIva, construirWorkbookConIva } from "./fixtures";

test("parsearCotizacionExcel: plantilla sin IVA (formato personal)", () => {
  const resultado = parsearCotizacionExcel(construirWorkbookSinIva());
  assert.ok(resultado);
  assert.equal(resultado!.cliente, "CLIENTE DE PRUEBA");
  assert.equal(resultado!.valorBase, 1_145_000);
  assert.equal(resultado!.tieneIva, false);
  assert.equal(resultado!.items.length, 3);
  assert.equal(resultado!.items[0].categoria, "MANTENIMIENTO");
  assert.equal(resultado!.items.at(-1)!.categoria, "MANO DE OBRA");
});

test("parsearCotizacionExcel: plantilla con IVA y 'OPCION 1' antes de VALOR BASE (formato empresa)", () => {
  const resultado = parsearCotizacionExcel(construirWorkbookConIva());
  assert.ok(resultado);
  assert.equal(resultado!.cliente, "CONJUNTO DE PRUEBA");
  assert.equal(resultado!.valorBase, 2_500_000);
  assert.equal(resultado!.valorIva, 475_000);
  assert.equal(resultado!.valorTotal, 2_975_000);
  assert.equal(resultado!.tieneIva, true);
  const categorias = new Set(resultado!.items.map((i) => i.categoria));
  assert.ok(categorias.has("SUMINISTROS CCTV"));
  assert.ok(categorias.has("MANO DE OBRA"));
  assert.equal(resultado!.items.length, 3);
});

test("parsearCotizacionExcel: hoja sin encabezados reconocibles devuelve null", () => {
  const { utils, write } = require("xlsx");
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([["esto", "no es", "una cotizacion"]]), "Hoja1");
  const buffer = write(wb, { type: "buffer", bookType: "xlsx" });
  assert.equal(parsearCotizacionExcel(buffer), null);
});
