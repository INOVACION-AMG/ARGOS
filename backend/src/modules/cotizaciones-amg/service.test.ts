import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTotalesCotizacion } from './service';

test('factura electrónica: solo aplica IVA 19%, sin recargo', () => {
  const r = calcularTotalesCotizacion([{ nombre: 'Cámara', cantidad: 3, precioUnitario: 150000 }], 0, false);
  assert.equal(r.subtotal, 450000);
  assert.equal(r.recargo, 0);
  assert.equal(r.iva, 85500); // 450000 * 0.19
  assert.equal(r.total, 535500);
});

test('cuenta de cobro: aplica recargo 30% + IVA 19% sobre el subtotal', () => {
  const r = calcularTotalesCotizacion([{ nombre: 'DVR', cantidad: 1, precioUnitario: 380000 }], 0, true);
  assert.equal(r.subtotal, 380000);
  assert.equal(r.recargo, 114000); // 30%
  assert.equal(r.iva, 72200); // 19%
  assert.equal(r.total, r.subtotal + r.recargo + r.iva);
});

test('ajuste por tipo de cliente (%) se aplica al precio unitario antes de redondear', () => {
  const r = calcularTotalesCotizacion([{ nombre: 'Cámara', cantidad: 3, precioUnitario: 150000 }], -5, false);
  assert.equal(r.items[0].valorUnitario, 142500); // 150000 * 0.95
  assert.equal(r.subtotal, 427500);
});

test('cantidad fraccionaria (metraje) redondea por ítem antes de sumar, no al final', () => {
  const r = calcularTotalesCotizacion([{ nombre: 'Cable UTP', cantidad: 12.5, precioUnitario: 2800 }], 10, true);
  // 2800 * 1.10 = 3080 (unitario ya redondeado); 3080 * 12.5 = 38500 exacto
  assert.equal(r.items[0].valorUnitario, 3080);
  assert.equal(r.items[0].valorTotal, 38500);
  assert.equal(r.subtotal, 38500);
});

test('subtotal es la suma de los valorTotal ya redondeados, no una recomputación en crudo', () => {
  const r = calcularTotalesCotizacion(
    [
      { nombre: 'Cámara', cantidad: 4, precioUnitario: 150000 },
      { nombre: 'DVR', cantidad: 1, precioUnitario: 380000 },
    ],
    0,
    true,
  );
  const sumaManual = r.items.reduce((acc, it) => acc + it.valorTotal, 0);
  assert.equal(r.subtotal, sumaManual);
  assert.equal(r.total, r.subtotal + r.recargo + r.iva);
});

test('sin ítems devuelve todo en cero sin lanzar error', () => {
  const r = calcularTotalesCotizacion([], 0, true);
  assert.deepEqual(r.items, []);
  assert.equal(r.subtotal, 0);
  assert.equal(r.recargo, 0);
  assert.equal(r.iva, 0);
  assert.equal(r.total, 0);
});
