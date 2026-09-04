// Plantilla: fragmento de messageRouter.ts para el bot de domicilios.
//
// Reemplaza, dentro de `manejarMensajeDeCliente` en
// backend/src/whatsapp/messageRouter.ts, todo el bloque que va desde
// `const formatoCOP = ...` hasta el final de la función (justo después de
// obtener `interpretacion`). No toca nada de arriba (aprobación de
// cliente, requiere_humano, etc. — eso ya es genérico y no cambia).
//
// También requiere el cambio en modules/pedidos/service.ts que se explica
// en pedidos.service.fragmento.ts de esta misma carpeta.

import { crearPedido } from '../../modules/pedidos/service'; // ver pedidos.service.fragmento.ts

// --- dentro de manejarMensajeDeCliente, después de `const interpretacion = await interpretarMensajeCliente(texto, catalogo);` ---

/*
    const formatoCOP = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
    const partes: string[] = [];

    if (interpretacion.items.length > 0) {
      const confirmados = await crearPedido(cliente.id, interpretacion.items, catalogo);

      if (confirmados.length > 0) {
        const resumen = confirmados
          .map((i) => `- ${i.producto}: ${i.cantidad} x ${formatoCOP(i.precioUnitario)} = ${formatoCOP(i.subtotal)}`)
          .join('\n');
        const total = confirmados.reduce((acc, i) => acc + i.subtotal, 0);
        partes.push(`Pedido registrado:\n${resumen}\n\nTotal: ${formatoCOP(total)}`);
      }
    }

    if (interpretacion.productosNoDisponibles.length > 0) {
      const listaCatalogo = catalogo.map((p) => `- ${p.nombre}: ${formatoCOP(p.precioActual)}`).join('\n');
      partes.push(
        `No tenemos disponible eso: ${interpretacion.productosNoDisponibles.join(', ')}.\n\n` +
          `Esto es lo que sí tenemos disponible:\n${listaCatalogo}`,
      );
    }

    if (partes.length > 0) {
      await socket.sendMessage(remoteJid, { text: partes.join('\n\n') + '\n\n¡Gracias por tu pedido!' });
      return;
    }

    // 'consulta', sin pedido ni productos no disponibles mencionados
    await socket.sendMessage(remoteJid, {
      text:
        interpretacion.respuesta ??
        '¡Hola! Soy el asistente virtual. Cuéntame qué quieres pedir y te lo registro.',
    });
*/
