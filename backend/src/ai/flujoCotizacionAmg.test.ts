import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespuestaAprobacion, validarRespuestaTarifa, validarSolicitudHistorial } from './flujoCotizacionAmg';

test('validarRespuestaAprobacion: forma correcta pasa tal cual', () => {
  const r = validarRespuestaAprobacion({ aprobado: false, ajustes: [{ nombre: 'Cámara', nuevoPrecioUnitario: 180000 }] });
  assert.equal(r.aprobado, false);
  assert.equal(r.ajustes.length, 1);
});

test('validarRespuestaAprobacion: descarta ajustes sin nombre o con tipos incorrectos', () => {
  const r = validarRespuestaAprobacion({
    aprobado: false,
    ajustes: [
      { nuevoPrecioUnitario: 100 }, // sin nombre
      { nombre: 'Cámara', nuevoPrecioUnitario: '100' }, // precio no es number
      { nombre: 'DVR', nuevoPrecioUnitario: 380000 }, // válido
    ],
  });
  assert.equal(r.ajustes.length, 1);
  assert.equal(r.ajustes[0].nombre, 'DVR');
});

test('validarRespuestaAprobacion: input completamente inesperado no lanza error', () => {
  const r = validarRespuestaAprobacion(null);
  assert.equal(r.aprobado, false);
  assert.deepEqual(r.ajustes, []);
});

test('validarRespuestaTarifa: filtra actualizaciones de mano de obra malformadas', () => {
  const r = validarRespuestaTarifa({
    ajustePorcentaje: -10,
    actualizacionesManoObra: [
      { nombre: 'Mano de obra por servicio', precio: 105000 },
      { nombre: '', precio: 100 }, // nombre vacío
      { precio: 100 }, // sin nombre
      { nombre: 'Cable instalado', precio: '1650' }, // precio no es number
    ],
  });
  assert.equal(r.ajustePorcentaje, -10);
  assert.equal(r.actualizacionesManoObra.length, 1);
  assert.equal(r.actualizacionesManoObra[0].nombre, 'Mano de obra por servicio');
});

test('validarRespuestaTarifa: ajustePorcentaje no numérico se descarta (queda undefined)', () => {
  const r = validarRespuestaTarifa({ ajustePorcentaje: 'diez por ciento', actualizacionesManoObra: [] });
  assert.equal(r.ajustePorcentaje, undefined);
});

test('validarSolicitudHistorial: forma correcta e incorrecta', () => {
  assert.deepEqual(validarSolicitudHistorial({ esSolicitudDeHistorial: true, nombreCliente: 'Altavista' }), {
    esSolicitudDeHistorial: true,
    nombreCliente: 'Altavista',
  });
  assert.deepEqual(validarSolicitudHistorial({ esSolicitudDeHistorial: 'si' }), {
    esSolicitudDeHistorial: false,
    nombreCliente: undefined,
  });
  assert.deepEqual(validarSolicitudHistorial(undefined), { esSolicitudDeHistorial: false, nombreCliente: undefined });
});
