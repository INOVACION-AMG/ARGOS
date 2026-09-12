// Pruebas de integración reales contra Supabase/Postgres -- necesitan el
// .env de MODO_BOT=amg configurado (AMG_SUPABASE_*, AMG_COMERCIAL_ID) y red.
// No son parte del build de producción, solo se corren a mano/CI.
import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizarCotizacion } from './messageRouter';
import { guardarSesion, obtenerSesion, borrarSesion, borradorVacio } from '../modules/sesion-cotizacion-amg/service';
import type { Client } from './greenApi';

function clienteFalso() {
  const mensajesEnviados: { chatId: string; texto: unknown }[] = [];
  const client = {
    sendMessage: async (chatId: string, texto: unknown) => {
      mensajesEnviados.push({ chatId, texto });
      return { id: { _serialized: `fake-${mensajesEnviados.length}` } };
    },
  } as unknown as Client;
  return { client, mensajesEnviados };
}

test('finalizarCotizacion: si la RPC falla, la sesión se conserva (no se pierde el borrador)', async () => {
  const numero = `573000000000_test_integ_${Date.now()}`;
  const chatId = `${numero}@c.us`;
  const ownJid = '573000000001@c.us';

  const borrador = borradorVacio(numero, 'Cliente Prueba Integracion');
  // productoId con formato válido pero que no existe en la tabla `productos`
  // real -- la RPC falla por violación de llave foránea en cotizacion_items,
  // simulando un error genuino de Supabase/red a mitad de la creación.
  borrador.items.push({
    productoId: '00000000-0000-0000-0000-000000000000',
    nombre: 'Producto inexistente para forzar el fallo',
    cantidad: 1,
    precioUnitario: 100000,
    tipo: 'suministro',
  });
  borrador.tipoDocumento = 'factura';

  await guardarSesion(numero, 'esperando_aprobacion', borrador);

  const { client, mensajesEnviados } = clienteFalso();

  try {
    await finalizarCotizacion(client, ownJid, chatId, borrador);

    const sesion = await obtenerSesion(numero);
    assert.notEqual(sesion, null, 'la sesión debía conservarse tras el fallo, pero se borró');
    assert.equal(sesion?.fase, 'esperando_aprobacion');
    assert.ok(sesion?.datos.idempotencyKey, 'la sesión conservada debía tener una idempotencyKey generada');

    const mensajeAlCliente = mensajesEnviados.find((m) => m.chatId === chatId);
    assert.ok(mensajeAlCliente, 'debía avisarle al cliente que algo falló');
    assert.match(String(mensajeAlCliente!.texto), /no se perdió nada/i);

    const avisoAlDueno = mensajesEnviados.find((m) => m.chatId === ownJid);
    assert.ok(avisoAlDueno, 'debía notificar al dueño del fallo');
  } finally {
    await borrarSesion(numero);
  }
});
