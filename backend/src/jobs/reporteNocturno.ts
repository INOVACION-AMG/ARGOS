import type { WASocket } from '@whiskeysockets/baileys';
import { obtenerResumenDelDia } from '../modules/pedidos/service';

export async function enviarReporteNocturno(socket: WASocket) {
  const numeroColver = process.env.COLVER_WHATSAPP_NUMBER;

  if (!numeroColver) {
    console.warn('COLVER_WHATSAPP_NUMBER no está configurado en .env. No se envió el reporte nocturno.');
    return;
  }

  const resumen = await obtenerResumenDelDia();

  if (resumen.totalPedidos === 0) {
    console.log('No hubo pedidos hoy, no se envía reporte a Colver.');
    return;
  }

  const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
  const fecha = resumen.desde.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });

  const resumenTexto = resumen.items.map((i) => `- ${i.producto}: ${i.kilos}kg`).join('\n');

  const texto =
    `📦 Reporte de pedidos del día (${fecha})\n\n` +
    `${resumenTexto}\n\n` +
    `Total de pedidos: ${resumen.totalPedidos}\n` +
    `Total en ventas: ${formatoCOP(resumen.totalGeneral)}`;

  const jid = `${numeroColver}@s.whatsapp.net`;
  await socket.sendMessage(jid, { text: texto });
  console.log(`Reporte nocturno enviado a Colver (${numeroColver}).`);
}
