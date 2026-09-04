# Activar: bot de agendamiento para consultorio médico

1. Copiar `backend/` completo a un proyecto nuevo (no tocar el de D'Carnes).
2. Guardar `citas.ts` de esta carpeta como `src/ai/citas.ts` (no reemplaza
   `orders.ts`, va aparte — más claro para mantener). Cambiar
   `NOMBRE_NEGOCIO` por el nombre real del prospecto.
3. En `src/whatsapp/messageRouter.ts`:
   - Cambiar el import `from '../ai/orders'` por `from '../ai/citas'`.
   - Reemplazar el bloque de `manejarMensajeDeCliente` (desde donde se
     obtiene `interpretacion`) según `messageRouter.fragmento.ts` de esta
     carpeta.
   - Ya NO se usa `crearPedido` — se puede quitar ese import.
4. No hace falta ninguna migración de base de datos: se reutiliza la tabla
   `Producto` como "servicios" y el mecanismo de `requiereAtencion` que ya
   existe para escalar a un humano.
5. Cargar `servicios.ejemplo.ts` (o los reales del consultorio) en la tabla
   `Producto`.
6. `.env` con `ANTHROPIC_API_KEY` y una base de datos Postgres nueva.
7. Borrar/crear `auth_session/` vacío, generar QR nuevo con el número de
   WhatsApp de la demo (nunca el de D'Carnes).
8. `pm2 start dist/index.js --name demo-consultorio-<nombre>`.

Cómo se comporta: el bot responde solo a preguntas frecuentes (horarios,
ubicación, precios, EPS/seguros). Toda solicitud real de cita — y
cualquier mensaje con síntomas o urgencias — se pasa siempre a un humano
con los datos ya extraídos (servicio, nombre, fecha/hora preferida,
motivo), porque no hay calendario conectado y el bot nunca debe dar
diagnósticos ni confirmar horarios por su cuenta.

**Nota:** esta misma base sirve, cambiando solo el catálogo y el tono del
prompt, para consultorio odontológico o bufete jurídico — ver las carpetas
`consultorio-odontologico/` y `bufete-juridico/`.
