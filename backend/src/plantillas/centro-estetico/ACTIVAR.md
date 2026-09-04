# Activar: bot de agendamiento para centro de estética (cejas, pestañas, labios)

Mismos pasos que `consultorio-medico/ACTIVAR.md`, usando los archivos de
esta carpeta:

1. Copiar `backend/` completo a un proyecto nuevo (no tocar el de D'Carnes).
2. Guardar `citas.ts` de esta carpeta como `src/ai/citas.ts`. Cambiar
   `NOMBRE_NEGOCIO` por el nombre real del negocio.
3. En `src/whatsapp/messageRouter.ts`: import a `../ai/citas`, reemplazar
   el bloque de `manejarMensajeDeCliente` según `messageRouter.fragmento.ts`
   de esta carpeta. Quitar el import de `crearPedido` (no se usa).
4. Sin migraciones nuevas: reutiliza `Producto` como "servicios" y
   `requiereAtencion` para escalar a un humano.
5. Cargar `servicios.ejemplo.ts` (o los reales del negocio, con precios
   verdaderos) en la tabla `Producto`.
6. `.env` con `ANTHROPIC_API_KEY` y una base de datos Postgres nueva
   (proyecto de Supabase separado del de D'Carnes).
7. Borrar/crear `auth_session/` vacío, generar QR nuevo con el número de
   WhatsApp del negocio (no el personal de la dueña, si se puede evitar —
   así queda libre para que ella siga usando su WhatsApp normal).
8. `pm2 start dist/index.js --name centro-estetico-<nombre>`.

Mismo comportamiento que los otros de agendamiento: el bot responde solo
preguntas frecuentes (horarios, ubicación, precios, duración aproximada) y
toda solicitud real de cita —o cualquier mensaje sobre molestias/reacciones
tras un procedimiento anterior— se pasa siempre a la esteticista con los
datos ya extraídos (servicio, nombre, fecha/hora preferida, motivo).
