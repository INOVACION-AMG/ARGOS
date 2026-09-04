# Plantillas de bot por tipo de negocio

Estas son bases **ya escritas y listas** para mostrarle a un prospecto nuevo
un bot funcionando en su tipo de negocio, sin escribir código desde cero.
No están conectadas al bot en producción de D'Carnes — son plantillas que se
activan copiando 2-3 archivos sobre una copia del proyecto.

## Qué hay en cada carpeta

Cada plantilla trae:

- **El intérprete de IA** (`orders.ts` o `citas.ts`): el prompt + el schema
  que le dice a Claude cómo clasificar los mensajes del cliente para ese
  negocio (qué es un pedido/cita, qué es una consulta que el bot responde
  solo, qué debe pasar a un humano).
- **`messageRouter.fragmento.ts`**: el pedazo de lógica que arma la
  respuesta de WhatsApp una vez la IA ya interpretó el mensaje. Reemplaza el
  bloque equivalente en `whatsapp/messageRouter.ts`.
- **Catálogo/servicios de ejemplo**: datos de muestra para la demo, editables
  en dos minutos con lo real del negocio del prospecto.
- **`ACTIVAR.md`**: los pasos exactos para poner esa plantilla a correr.

## Las dos familias de plantilla

1. **`restaurante-domicilios/`** — negocio que vende productos/platos y toma
   pedidos por WhatsApp (igual en espíritu al bot de D'Carnes, pero
   genérico: por unidad, no por kilo, y sin el nombre de D'Carnes hardcodeado).
   Sí usa base de datos (Postgres/Prisma) para guardar pedidos, igual que hoy.

2. **`consultorio-medico/`, `consultorio-odontologico/`, `bufete-juridico/`**
   — negocios que agendan citas, no venden productos. En vez de "pedido",
   la IA extrae una **solicitud de cita** (servicio, nombre, fecha/hora
   preferida, motivo breve) y el bot **siempre la pasa a un humano** para
   confirmar disponibilidad real (reutiliza el mecanismo de
   "requiere atención" que ya existe en `modules/clientes/service.ts` — no
   hace falta tocar la base de datos ni crear tablas nuevas de citas). El
   bot solo responde solo preguntas frecuentes (horarios, ubicación,
   precios, si atienden tal seguro/EPS, etc.).

## Cómo activar una plantilla para un prospecto

Ver el `ACTIVAR.md` de la carpeta específica. En resumen:

1. Copiar la carpeta `backend/` completa a un proyecto nuevo (ej.
   `C:\Users\usuario\demo-bot-<negocio>\backend`) — **nunca sobre el
   backend de producción de D'Carnes**.
2. Reemplazar `src/ai/orders.ts` con el archivo de la plantilla elegida.
3. Reemplazar el bloque correspondiente en `src/whatsapp/messageRouter.ts`
   con `messageRouter.fragmento.ts` de la plantilla.
4. Cargar el catálogo/servicios de ejemplo (o los reales si ya los dio el
   prospecto) usando el mismo mecanismo que ya existe (foto de lista de
   precios, o insertarlos directo en la tabla `Producto`).
5. Generar un WhatsApp QR nuevo para ese número de demo (nunca reusar la
   sesión de D'Carnes) y `pm2 start` con un nombre de proceso distinto
   (ej. `demo-restaurante`, `demo-consultorio`) para no chocar con el bot
   real.

Cada plantilla es independiente: activar una no afecta a las otras ni al
bot de D'Carnes en producción.
