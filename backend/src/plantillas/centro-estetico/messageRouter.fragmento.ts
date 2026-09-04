// Plantilla: fragmento de messageRouter.ts para el bot de agendamiento de
// citas de un centro de estética (cejas, pestañas, labios). Misma
// estructura que consultorio-medico/messageRouter.fragmento.ts — cambia
// "paciente" por "clienta" y "secretaria/doctor" por "esteticista".
//
// El import de `interpretarMensajeCliente` apunta a '../ai/citas' (el
// archivo de esta carpeta).

/*
    if (mensajeId) {
      await marcarMensajeProcesado(cliente.id, mensajeId);
    }

    if (cliente.requiereAtencion) {
      return;
    }

    const catalogo = await obtenerCatalogo(); // servicios de cejas/pestañas/labios

    if (catalogo.length === 0) {
      await socket.sendMessage(remoteJid, {
        text: 'Hola! Por ahora no tengo cargados los servicios, en un momento te confirmamos.',
      });
      return;
    }

    const interpretacion = await interpretarMensajeCliente(texto, catalogo);

    if (interpretacion.tipo === 'requiere_humano') {
      const motivo = interpretacion.motivo ?? 'mensaje que necesita revisión manual';
      await marcarRequiereAtencion(cliente.id, motivo);

      await socket.sendMessage(remoteJid, {
        text: 'Ya recibí tu mensaje. En un momento te escribe alguien de nuestro equipo.',
      });

      await socket.sendMessage(ownJid, {
        text:
          `⚠️ Atención requerida\n` +
          `Clienta: ${cliente.nombre} (${numero})\n` +
          `Motivo: ${motivo}\n` +
          `Mensaje: "${texto}"\n\n` +
          `El bot dejó de responderle automáticamente. Escríbele tú, y cuando termines escribe ${COMANDO_REANUDAR} en ese chat para reactivarlo.`,
      });
      return;
    }

    if (interpretacion.tipo === 'agendar_cita' && interpretacion.solicitud) {
      const servicio = catalogo.find((s) => s.id === interpretacion.solicitud?.servicioId);
      const s = interpretacion.solicitud;

      // Toda solicitud de cita se pasa a la esteticista: no hay calendario
      // conectado, así que el bot nunca confirma un horario real por su
      // cuenta.
      const resumenParaHumano =
        `📅 Solicitud de cita\n` +
        `Clienta: ${cliente.nombre} (${numero})\n` +
        `Servicio: ${servicio?.nombre ?? '(no identificado, revisar mensaje original)'}\n` +
        `Fecha/hora preferida: ${s.fechaHoraPreferida ?? '(no especificó)'}\n` +
        `Motivo: ${s.motivo ?? '(no especificó)'}\n` +
        `Mensaje original: "${texto}"`;

      await marcarRequiereAtencion(cliente.id, `Solicitud de cita: ${servicio?.nombre ?? 'servicio no identificado'}`);
      await socket.sendMessage(ownJid, { text: resumenParaHumano });

      await socket.sendMessage(remoteJid, {
        text:
          `¡Gracias${s.nombreCompleto ? ` ${s.nombreCompleto}` : ''}! Ya recibimos tu solicitud de cita` +
          `${servicio ? ` para ${servicio.nombre}` : ''}${s.fechaHoraPreferida ? ` (${s.fechaHoraPreferida})` : ''}.\n` +
          `En un momento te confirmamos el horario disponible.`,
      });
      return;
    }

    if (interpretacion.serviciosNoDisponibles.length > 0) {
      const listaCatalogo = catalogo.map((s) => `- ${s.nombre}`).join('\n');
      await socket.sendMessage(remoteJid, {
        text:
          `Ese servicio no lo manejamos: ${interpretacion.serviciosNoDisponibles.join(', ')}.\n\n` +
          `Esto es lo que sí ofrecemos:\n${listaCatalogo}`,
      });
      return;
    }

    // 'consulta'
    await socket.sendMessage(remoteJid, {
      text:
        interpretacion.respuesta ??
        '¡Hola! Soy el asistente virtual. Cuéntame qué servicio te interesa y para cuándo, y te ayudo a agendar.',
    });
*/
