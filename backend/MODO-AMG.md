# Modo compartido: D'Carnes / AMG

Argos es una sola instancia/número de WhatsApp que se comparte entre dos
clientes reales: D'Carnes (producción normal) y AMG (el negocio propio del
usuario, ver `C:\Users\usuario\AMG-LEGION`). No son dos despliegues — es un
toggle que cambia qué catálogo/IA/base responde.

**Librería de WhatsApp: whatsapp-web.js (no Baileys).** Se migró el 2026-09-08
porque Baileys (reimplementa a mano el cifrado de WhatsApp) tenía fallos
reales con esta cuenta Business no verificada — sesiones "Bad MAC", el
identificador nuevo "LID" mal reconocido, mensajes que llegaban con doble
check pero nunca alcanzaban al bot. whatsapp-web.js controla un Chrome real
corriendo la app oficial de WhatsApp Web, así que hereda el mismo manejo de
cuentas Business/LID que tendría un humano usando el navegador. Limitación
conocida: `downloadMedia()` (fotos, notas de voz) falla de forma intermitente
con un error interno de Puppeteer poco descriptivo — el bot degrada bien
(pide que se lo escriban) en vez de caerse, pero no está resuelto de raíz.

## Antes de poder activar modo AMG (una sola vez)

En `.env`, además de `MODO_BOT`, hacen falta:

- `AMG_SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard del proyecto
  AMG-LEGION (ref `mhgykrpuchkzjceypmej`) > Project Settings > API >
  `service_role` (secreta, nunca la `anon`). Necesaria porque el bot escribe
  cotizaciones sin sesión de usuario (bypassa RLS).
- `AMG_COMERCIAL_ID` — UUID de una fila de `profiles` en AMG-LEGION con
  `role` admin o comercial. Todas las cotizaciones y clientes que cree el
  bot quedan atribuidos a este perfil (columnas `comercial_id`/`created_by`,
  NOT NULL). Sacarlo con, en el SQL Editor de ese proyecto de Supabase:
  `select id, full_name, role from profiles where role in ('admin','comercial');`

Sin estos dos valores, el modo AMG falla con un error claro (no rompe modo
D'Carnes).

## Cambiar de modo

```
# en argos-bot/backend/.env
MODO_BOT=amg        # o: dcarnes

pm2 restart dcarnes-bot
```

Toma unos segundos, no pierde la sesión de WhatsApp vinculada (no hace falta
QR nuevo). El bot sigue siendo el mismo número/chat.

## Qué cambia en modo AMG

- Catálogo: en vez del catálogo por kilos propio (Prisma), lee en vivo la
  tabla `productos` de AMG-LEGION (Supabase real, `activo=true`, `precio>0`).
  Búsqueda por palabra clave con ranking de relevancia (ver
  `src/modules/productos-amg/service.ts`).
- Interpretación de mensajes: `src/ai/ordersAmg.ts` — clasifica en
  `cotizacion` / `consulta` / `requiere_humano` para un negocio de seguridad
  electrónica (CCTV, control de acceso, alarmas, cerca eléctrica), no carnes.
  También interpreta imágenes (foto de una lista de equipos, cotización de
  otro proveedor, etc.) cuando `downloadMedia()` logra bajarlas.
- Al pedir productos que sí coinciden con el catálogo, el bot crea una
  cotización REAL en AMG-LEGION (`cotizaciones` + `cotizacion_items`, mismo
  cálculo de IVA 19% que el cotizador web) y **manda el PDF automáticamente
  por WhatsApp** (mismo diseño que el cotizador web, ver `src/pdf/`) — no
  hace falta que nadie lo genere a mano.
- **Producto no encontrado → `/agregar`:** si un cliente pide algo que no
  está en el catálogo, el bot le avisa al dueño por el chat "Tú" y guarda
  una "solicitud de producto" pendiente (`SolicitudProductoAmg`, tabla propia
  del bot). Contestando en ese mismo chat `/agregar <precio> <nombre>` se
  agrega de verdad al catálogo de AMG-LEGION (visible también en la app web)
  y se le manda al cliente la cotización completa con PDF.
- Si la IA no está segura (pedido genérico, diseño de sistema completo,
  reclamo, quiere hablar con alguien) escala a humano igual que D'Carnes:
  el bot se calla en ese chat y te avisa por WhatsApp; `/reanudar <numero>`
  para devolverle el control.
- **Lista blanca de números:** `ARGOS_NUMEROS_AUTORIZADOS` en `.env`
  (separados por coma, formato `57XXXXXXXXXX`) — si se configura, en modo
  AMG el bot ignora por completo (sin responder, sin tocar la base) a
  cualquiera que no esté en la lista. Vacío = responde a cualquiera. El chat
  "Tú" (el dueño escribiéndose a sí mismo) nunca se filtra.
- El estado de aprobación/escalamiento de clientes (`Cliente` de Prisma,
  propio de este bot) es compartido entre ambos modos — es solo control de
  quién puede hablar con el bot, no datos de negocio.

## Probar sin un segundo celular

`POST /admin/simular-mensaje` con `{"texto": "necesito 4 cámaras domo 4MP"}`
usa el chat "Tú" del dueño como cliente de prueba — sirve para probar modo
AMG sin arriesgar una conversación real de D'Carnes. También sirve escribirse
directamente en el chat "Tú" (mismo efecto, más natural).

## Volver a modo D'Carnes

Igual: `MODO_BOT=dcarnes` en `.env` + `pm2 restart dcarnes-bot`. Nada de lo
anterior se pierde: D'Carnes sigue en su propia base Prisma, intacta.
