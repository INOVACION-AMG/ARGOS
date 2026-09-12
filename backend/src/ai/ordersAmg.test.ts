import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarInterpretacionAmg } from './ordersAmg';
import type { ProductoCatalogoAmg } from './ordersAmg';

const catalogo: ProductoCatalogoAmg[] = [
  { id: 'p1', sku: 'SKU1', nombre: 'Cámara domo 4MP', categoria: null, tipo: 'suministro', unidad: 'unidad', precio: 150000 },
];

test('validarInterpretacionAmg: items con productoId real y cantidad válida pasan', () => {
  const r = validarInterpretacionAmg({ tipo: 'cotizacion', items: [{ productoId: 'p1', cantidad: 2 }], productosNoDisponibles: [] }, catalogo);
  assert.equal(r.tipo, 'cotizacion');
  assert.equal(r.items.length, 1);
});

test('validarInterpretacionAmg: descarta ítems con productoId que no existe en el catálogo dado', () => {
  const r = validarInterpretacionAmg(
    { tipo: 'cotizacion', items: [{ productoId: 'no-existe', cantidad: 2 }], productosNoDisponibles: [] },
    catalogo,
  );
  assert.equal(r.items.length, 0);
});

test('validarInterpretacionAmg: descarta ítems con cantidad no finita o no positiva', () => {
  const r = validarInterpretacionAmg(
    {
      tipo: 'cotizacion',
      items: [
        { productoId: 'p1', cantidad: NaN },
        { productoId: 'p1', cantidad: -1 },
        { productoId: 'p1', cantidad: 0 },
        { productoId: 'p1', cantidad: 3 },
      ],
      productosNoDisponibles: [],
    },
    catalogo,
  );
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].cantidad, 3);
});

test('validarInterpretacionAmg: tipo fuera del enum esperado cae a "consulta"', () => {
  const r = validarInterpretacionAmg({ tipo: 'algo_inventado', items: [], productosNoDisponibles: [] }, catalogo);
  assert.equal(r.tipo, 'consulta');
});

test('validarInterpretacionAmg: input nulo no lanza error y devuelve una forma segura', () => {
  const r = validarInterpretacionAmg(null, catalogo);
  assert.equal(r.tipo, 'consulta');
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.productosNoDisponibles, []);
});
