# Activar: bot de domicilios para restaurante

1. Copiar `backend/` completo a un proyecto nuevo (no tocar el de D'Carnes).
2. Reemplazar `src/ai/orders.ts` con `orders.ts` de esta carpeta.
   - Cambiar `NOMBRE_NEGOCIO` por el nombre real del prospecto.
3. Reemplazar `crearPedido` en `src/modules/pedidos/service.ts` con el
   contenido de `pedidos.service.fragmento.ts` de esta carpeta.
4. En `src/whatsapp/messageRouter.ts`, reemplazar el bloque de
   `manejarMensajeDeCliente` según `messageRouter.fragmento.ts` de esta
   carpeta (usa `cantidad`/`precioUnitario` en vez de `kilos`/`precioUnitKg`
   en los textos que se le muestran al cliente).
5. `npm install` y `npx prisma migrate deploy` (mismo schema, no hace falta
   migración nueva para esta demo).
6. Cargar el catálogo de ejemplo (`menu.ejemplo.ts`) o el real del
   prospecto en la tabla `Producto`.
7. Configurar `.env` con `ANTHROPIC_API_KEY` y la conexión a una base de
   datos Postgres nueva (no la de D'Carnes).
8. Borrar/crear `auth_session/` vacío y correr la app para generar un QR
   nuevo — vincular con el número de WhatsApp de la demo (nunca con el de
   D'Carnes).
9. `pm2 start dist/index.js --name demo-restaurante-<nombre>`.

Con eso el bot ya responde igual que el de D'Carnes, pero como un
restaurante genérico: toma pedidos por unidad, confirma domicilio pidiendo
dirección/barrio/zona/teléfono, y escala a un humano solo reclamos,
negociación de precio o cancelaciones.
