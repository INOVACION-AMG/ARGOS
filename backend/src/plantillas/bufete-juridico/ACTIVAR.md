# Activar: bot de agendamiento para bufete jurídico

Mismos pasos que `consultorio-medico/ACTIVAR.md`, usando los archivos de
esta carpeta:

1. Copiar `backend/` completo a un proyecto nuevo (no tocar el de D'Carnes).
2. Guardar `citas.ts` de esta carpeta como `src/ai/citas.ts`. Cambiar
   `NOMBRE_NEGOCIO` por el nombre real del bufete.
3. En `src/whatsapp/messageRouter.ts`: import a `../ai/citas`, reemplazar
   el bloque de `manejarMensajeDeCliente` según `messageRouter.fragmento.ts`
   de esta carpeta. Quitar el import de `crearPedido` (no se usa).
4. Sin migraciones nuevas: reutiliza `Producto` como "áreas de práctica" y
   `requiereAtencion` para escalar a un humano.
5. Cargar `servicios.ejemplo.ts` (o las áreas reales del bufete) en la
   tabla `Producto`.
6. `.env` con `ANTHROPIC_API_KEY` y base de datos Postgres nueva.
7. QR nuevo con el número de WhatsApp de la demo.
8. `pm2 start dist/index.js --name demo-juridico-<nombre>`.

**Regla dura de esta plantilla:** el bot nunca da asesoría legal ni opina
sobre un caso — solo agenda la consulta. Si preguntan algo tipo "¿tengo
derecho a...?", el bot responde que eso se revisa en la consulta con el
abogado y ofrece agendarla. Esto está reforzado directamente en el prompt
(`citas.ts`), no depende de que el usuario lo pida bien.
