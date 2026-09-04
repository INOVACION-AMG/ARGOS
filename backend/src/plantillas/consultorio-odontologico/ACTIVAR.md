# Activar: bot de agendamiento para consultorio odontológico

Mismos pasos que `consultorio-medico/ACTIVAR.md`, usando los archivos de
esta carpeta (`citas.ts`, `messageRouter.fragmento.ts`,
`servicios.ejemplo.ts`) en vez de los de medicina general:

1. Copiar `backend/` completo a un proyecto nuevo (no tocar el de D'Carnes).
2. Guardar `citas.ts` de esta carpeta como `src/ai/citas.ts`. Cambiar
   `NOMBRE_NEGOCIO` por el nombre real del prospecto.
3. En `src/whatsapp/messageRouter.ts`: import a `../ai/citas`, reemplazar
   el bloque de `manejarMensajeDeCliente` según `messageRouter.fragmento.ts`
   de esta carpeta. Quitar el import de `crearPedido` (no se usa).
4. Sin migraciones nuevas: reutiliza `Producto` como "servicios" y
   `requiereAtencion` para escalar a un humano.
5. Cargar `servicios.ejemplo.ts` (o los reales del consultorio) en la tabla
   `Producto`.
6. `.env` con `ANTHROPIC_API_KEY` y base de datos Postgres nueva.
7. QR nuevo con el número de WhatsApp de la demo.
8. `pm2 start dist/index.js --name demo-odontologia-<nombre>`.

Mismo comportamiento que el consultorio médico: el bot responde solo
preguntas frecuentes, y toda solicitud de cita o mensaje con dolor/urgencia
se pasa siempre a un humano con los datos ya extraídos.
