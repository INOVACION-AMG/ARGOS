import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esPrecioValido, esCantidadValida, aplicarAjustes } from './messageRouter';
import { borradorVacio, type BorradorCotizacionAmg } from '../modules/sesion-cotizacion-amg/service';

function borradorConItem(): BorradorCotizacionAmg {
  const b = borradorVacio('573000000000');
  b.items.push({ productoId: 'p1', nombre: 'Cámara domo 4MP', cantidad: 2, precioUnitario: 150000, tipo: 'suministro' });
  return b;
}

test('esPrecioValido: acepta positivos finitos dentro del tope, rechaza el resto', () => {
  assert.equal(esPrecioValido(150000), true);
  assert.equal(esPrecioValido(0), true);
  assert.equal(esPrecioValido(-1), false);
  assert.equal(esPrecioValido(NaN), false);
  assert.equal(esPrecioValido(Infinity), false);
  assert.equal(esPrecioValido(500_000_001), false); // pasa el tope de sanidad
  assert.equal(esPrecioValido(500_000_000), true); // justo en el tope
});

test('esCantidadValida: exige positivo finito dentro del tope', () => {
  assert.equal(esCantidadValida(1), true);
  assert.equal(esCantidadValida(12.5), true); // metraje fraccionario
  assert.equal(esCantidadValida(0), false);
  assert.equal(esCantidadValida(-3), false);
  assert.equal(esCantidadValida(NaN), false);
  assert.equal(esCantidadValida(100_001), false);
});

test('aplicarAjustes: un precio inválido se ignora y no reporta cambio', () => {
  const b = borradorConItem();
  const precioOriginal = b.items[0].precioUnitario;
  const huboCambios = aplicarAjustes(b, [{ nombre: 'Cámara', nuevoPrecioUnitario: -50000 }]);
  assert.equal(huboCambios, false);
  assert.equal(b.items[0].precioUnitario, precioOriginal);
});

test('aplicarAjustes: un precio válido se aplica y reporta cambio (dispara rotación de llave)', () => {
  const b = borradorConItem();
  const huboCambios = aplicarAjustes(b, [{ nombre: 'Cámara', nuevoPrecioUnitario: 180000 }]);
  assert.equal(huboCambios, true);
  assert.equal(b.items[0].precioUnitario, 180000);
});

test('aplicarAjustes: eliminar un ítem reporta cambio', () => {
  const b = borradorConItem();
  const huboCambios = aplicarAjustes(b, [{ nombre: 'Cámara', eliminar: true }]);
  assert.equal(huboCambios, true);
  assert.equal(b.items.length, 0);
});

test('aplicarAjustes: nombre que no coincide con ningún ítem no reporta cambio', () => {
  const b = borradorConItem();
  const huboCambios = aplicarAjustes(b, [{ nombre: 'Producto que no existe', nuevoPrecioUnitario: 1000 }]);
  assert.equal(huboCambios, false);
});

test('aplicarAjustes: cantidad inválida (excede el tope) se ignora', () => {
  const b = borradorConItem();
  const cantidadOriginal = b.items[0].cantidad;
  const huboCambios = aplicarAjustes(b, [{ nombre: 'Cámara', nuevaCantidad: 999_999 }]);
  assert.equal(huboCambios, false);
  assert.equal(b.items[0].cantidad, cantidadOriginal);
});
