import { test } from "node:test";
import assert from "node:assert/strict";
import { numeroALetras } from "./numeroALetras";

test("numeroALetras: casos reales de cuentas de cobro", () => {
  assert.equal(numeroALetras(23_940_000), "VEINTITRÉS MILLONES NOVECIENTOS CUARENTA MIL PESOS");
  assert.equal(numeroALetras(62_568_000), "SESENTA Y DOS MILLONES QUINIENTOS SESENTA Y OCHO MIL PESOS");
  assert.equal(numeroALetras(13_925_000), "TRECE MILLONES NOVECIENTOS VEINTICINCO MIL PESOS");
  assert.equal(numeroALetras(1_000_000), "UN MILLÓN PESOS");
  assert.equal(numeroALetras(1_021), "MIL VEINTIÚN PESOS");
  assert.equal(numeroALetras(100_000), "CIEN MIL PESOS");
  assert.equal(numeroALetras(500), "QUINIENTOS PESOS");
  assert.equal(numeroALetras(21), "VEINTIÚN PESOS");
});
