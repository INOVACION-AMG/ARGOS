import { db } from '../../db/client';

export async function obtenerOCrearCliente(numeroWhatsapp: string, nombre: string) {
  const existente = await db.cliente.findUnique({ where: { numeroWhatsapp } });
  if (existente) return { cliente: existente, esNuevo: false };

  const creado = await db.cliente.create({ data: { numeroWhatsapp, nombre } });
  return { cliente: creado, esNuevo: true };
}

export async function aprobarCliente(numeroWhatsapp: string) {
  return db.cliente.updateMany({
    where: { numeroWhatsapp },
    data: { aprobado: true },
  });
}

// A diferencia de aprobarCliente (comando manual, asume que el cliente ya
// existe), esta función se usa cuando el dueño etiqueta un chat en WhatsApp
// Business: puede ser un número que todavía no nos ha escrito nunca.
export async function aprobarClientePorEtiqueta(numeroWhatsapp: string) {
  return db.cliente.upsert({
    where: { numeroWhatsapp },
    update: { aprobado: true },
    create: { numeroWhatsapp, nombre: `Cliente ${numeroWhatsapp}`, aprobado: true },
  });
}

export async function desaprobarClientePorEtiqueta(numeroWhatsapp: string) {
  return db.cliente.updateMany({
    where: { numeroWhatsapp },
    data: { aprobado: false },
  });
}

export async function marcarRequiereAtencion(clienteId: string, motivo: string) {
  return db.cliente.update({
    where: { id: clienteId },
    data: { requiereAtencion: true, motivoAtencion: motivo },
  });
}

export async function reanudarBot(numeroWhatsapp: string) {
  return db.cliente.updateMany({
    where: { numeroWhatsapp },
    data: { requiereAtencion: false, motivoAtencion: null },
  });
}

// Cursor de idempotencia: hasta qué mensaje de WhatsApp ya procesamos para
// este cliente. Se usa para no reprocesar mensajes ya respondidos (o
// re-notificar al dueño sobre el mismo número) cuando el bot recupera
// mensajes pendientes tras una caída o una reconexión.
export async function marcarMensajeProcesado(clienteId: string, mensajeId: string) {
  return db.cliente.update({
    where: { id: clienteId },
    data: { ultimoMensajeIdProcesado: mensajeId },
  });
}
