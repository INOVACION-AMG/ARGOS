import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { db } from '../db/client';
import { getSocket } from '../whatsapp/connection';
import { manejarMensajeDeCliente, enviarAvisoOwner } from '../whatsapp/messageRouter';
import { validarLogin } from '../modules/usuarios/service';
import { crearProducto, editarProducto, eliminarProducto } from '../modules/productos-precios/service';
import {
  crearFactura,
  crearVentaDirecta,
  listarFacturas,
  marcarPagada,
  obtenerFactura,
  pedidosPendientesDeCliente,
  type ItemVentaDirecta,
  type TipoFactura,
} from '../modules/facturas/service';
import { crearFacturaCompra, listarFacturasCompra, type ItemFacturaCompra } from '../modules/facturas-compra/service';
import { extraerFacturaCompra } from '../ai/facturaCompra';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; rol: string };
  }
}

export function buildServer() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      'Falta JWT_SECRET en .env -- sin esto los tokens de sesión de la app web se firmarían con un secreto público y adivinable.',
    );
  }

  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });

  // Solo orígenes locales -- la app web (frontend/) corre en la misma
  // máquina/red que este servidor (que además solo escucha en 127.0.0.1).
  app.register(cors, { origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] });
  app.register(jwt, { secret: jwtSecret });

  app.decorate('auth', async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ ok: false, error: 'No autorizado' });
    }
  });

  // Los endpoints /admin/* no tienen su propio login (están pensados para
  // scripts internos del dueño, ej. scripts/avisar_jefe_*.ts) -- hasta ahora
  // su única protección era que el server solo escucha en 127.0.0.1. Este
  // token es una segunda capa, para que no queden abiertos si algún día
  // cambia esa exposición (proxy, 0.0.0.0, etc.).
  const adminToken = process.env.ADMIN_INTERNAL_TOKEN;
  if (!adminToken) {
    throw new Error('Falta ADMIN_INTERNAL_TOKEN en .env -- protege los endpoints /admin/*.');
  }
  app.addHook('onRequest', async (req: any, reply: any) => {
    if (!req.url.startsWith('/admin/')) return;
    if (req.headers['x-internal-token'] !== adminToken) {
      reply.code(401).send({ ok: false, error: 'No autorizado' });
    }
  });

  // Para rutas administrativas (catálogo, compras) que un empleado en ruta
  // no debería poder tocar, aunque llame a la API directo.
  app.decorate('soloGerente', async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ ok: false, error: 'No autorizado' });
    }
    if (!['gerente', 'dueno'].includes(req.user.rol)) {
      return reply.code(403).send({ ok: false, error: 'Solo el gerente puede hacer esto' });
    }
  });

  app.get('/health', async () => ({ ok: true }));

  // --- Auth ---
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = (req.body as { email?: string; password?: string }) ?? {};
    if (!email || !password) {
      return reply.code(400).send({ ok: false, error: 'Falta email o password' });
    }
    const usuario = await validarLogin(email, password);
    if (!usuario) {
      return reply.code(401).send({ ok: false, error: 'Credenciales inválidas' });
    }
    const token = app.jwt.sign({ sub: usuario.id, email: usuario.email, rol: usuario.rol });
    return { ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } };
  });

  // --- Clientes ---
  app.get('/clientes', { preHandler: (app as any).auth }, async () => {
    const clientes = await db.cliente.findMany({ orderBy: { nombre: 'asc' } });
    const pendientes = await db.pedido.groupBy({
      by: ['clienteId'],
      where: { facturaId: null },
      _count: { id: true },
    });
    const conteoPorCliente = new Map(pendientes.map((p) => [p.clienteId, p._count.id]));
    return clientes.map((c) => ({ ...c, pedidosPendientes: conteoPorCliente.get(c.id) ?? 0 }));
  });

  app.get('/clientes/:id/pedidos-pendientes', { preHandler: (app as any).auth }, async (req) => {
    const { id } = req.params as { id: string };
    return pedidosPendientesDeCliente(id);
  });

  // --- Catálogo de productos ---
  // Nota: esta ruta trae directo de la base (incluye existenciaKg) porque es
  // para la app web. `obtenerCatalogo()` es la forma reducida que usa el bot
  // internamente para interpretar pedidos y no debe tocarse.
  app.get('/productos', { preHandler: (app as any).auth }, async () =>
    db.producto.findMany({ orderBy: { nombre: 'asc' } }),
  );

  app.post('/productos', { preHandler: (app as any).soloGerente }, async (req, reply) => {
    const { nombre, precioActual, unidad } = (req.body as { nombre?: string; precioActual?: number; unidad?: string }) ?? {};
    if (!nombre || precioActual === undefined) {
      return reply.code(400).send({ ok: false, error: 'Falta nombre o precioActual' });
    }
    return crearProducto(nombre, precioActual, unidad);
  });

  app.put('/productos/:id', { preHandler: (app as any).soloGerente }, async (req) => {
    const { id } = req.params as { id: string };
    const datos = req.body as { nombre?: string; precioActual?: number; unidad?: string };
    return editarProducto(id, datos);
  });

  app.delete('/productos/:id', { preHandler: (app as any).soloGerente }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await eliminarProducto(id);
      return { ok: true };
    } catch {
      return reply.code(409).send({
        ok: false,
        error: 'No se puede eliminar: este producto ya tiene pedidos o precios registrados.',
      });
    }
  });

  // --- Facturas ---
  app.get('/facturas', { preHandler: (app as any).auth }, async (req) => {
    const { estado, creadoPorId } = req.query as { estado?: string; creadoPorId?: string };
    return listarFacturas(estado, creadoPorId);
  });

  app.get('/facturas/:id', { preHandler: (app as any).auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const factura = await obtenerFactura(id);
    if (!factura) return reply.code(404).send({ ok: false, error: 'Factura no encontrada' });
    return factura;
  });

  app.post('/facturas', { preHandler: (app as any).auth }, async (req, reply) => {
    const { clienteId, pedidoIds, tipo } = (req.body as {
      clienteId?: string;
      pedidoIds?: string[];
      tipo?: TipoFactura;
    }) ?? {};
    if (!clienteId || !pedidoIds || pedidoIds.length === 0) {
      return reply.code(400).send({ ok: false, error: 'Falta clienteId o pedidoIds' });
    }
    try {
      return await crearFactura(clienteId, pedidoIds, tipo ?? 'normal', (req.user as any).sub);
    } catch (err) {
      return reply.code(400).send({ ok: false, error: (err as Error).message });
    }
  });

  // Venta hecha por un empleado en ruta: factura al cliente en el momento,
  // sin pasar por pedidos previos del bot de WhatsApp.
  app.post('/facturas/venta-directa', { preHandler: (app as any).auth }, async (req, reply) => {
    const { clienteId, items, tipo } = (req.body as {
      clienteId?: string;
      items?: ItemVentaDirecta[];
      tipo?: TipoFactura;
    }) ?? {};
    if (!clienteId || !items || items.length === 0) {
      return reply.code(400).send({ ok: false, error: 'Falta clienteId o items' });
    }
    try {
      return await crearVentaDirecta(clienteId, items, tipo ?? 'normal', (req.user as any).sub);
    } catch (err) {
      return reply.code(400).send({ ok: false, error: (err as Error).message });
    }
  });

  app.patch('/facturas/:id/pagada', { preHandler: (app as any).auth }, async (req) => {
    const { id } = req.params as { id: string };
    return marcarPagada(id);
  });

  // --- Facturas de compra (inventario) ---
  app.post('/facturas-compra/extraer', { preHandler: (app as any).soloGerente }, async (req, reply) => {
    const { imagenBase64, mediaType } = (req.body as {
      imagenBase64?: string;
      mediaType?: 'image/jpeg' | 'image/png' | 'image/webp';
    }) ?? {};
    if (!imagenBase64) {
      return reply.code(400).send({ ok: false, error: 'Falta imagenBase64' });
    }
    try {
      return await extraerFacturaCompra(imagenBase64, mediaType ?? 'image/jpeg');
    } catch (err) {
      return reply.code(422).send({ ok: false, error: (err as Error).message });
    }
  });

  app.get('/facturas-compra', { preHandler: (app as any).soloGerente }, async () => listarFacturasCompra());

  app.post('/facturas-compra', { preHandler: (app as any).soloGerente }, async (req, reply) => {
    const { proveedor, items } = (req.body as { proveedor?: string; items?: ItemFacturaCompra[] }) ?? {};
    if (!proveedor || !items || items.length === 0) {
      return reply.code(400).send({ ok: false, error: 'Falta proveedor o items' });
    }
    try {
      return await crearFacturaCompra(proveedor, items);
    } catch (err) {
      return reply.code(400).send({ ok: false, error: (err as Error).message });
    }
  });

  // Endpoint interno (solo localhost) para mandar un mensaje puntual a
  // cualquier número desde el dueño/soporte, ej. mensaje de presentación.
  app.post('/admin/enviar-mensaje', async (req, reply) => {
    const { numero, texto } = (req.body as { numero?: string; texto?: string } | undefined) ?? {};
    if (!numero || !texto) {
      return reply.code(400).send({ ok: false, error: 'Falta numero o texto' });
    }
    const socket = getSocket();
    await socket.sendMessage(`${numero}@c.us`, texto);
    return { ok: true };
  });

  // Endpoint interno (solo localhost) para que el propio bot se avise a sí
  // mismo por WhatsApp, ej. tras confirmar que una reconexión quedó sana.
  app.post('/admin/avisar-owner', async (req, reply) => {
    const { texto } = (req.body as { texto?: string } | undefined) ?? {};
    const socket = getSocket();
    const ownJid = socket.info?.wid?._serialized;
    if (!ownJid) {
      return reply.code(503).send({ ok: false, error: 'cliente sin usuario todavía' });
    }
    await enviarAvisoOwner(socket, ownJid, texto ?? '✅ El bot está sin novedad, conectado correctamente a WhatsApp.');
    return { ok: true };
  });

  // Endpoint interno de prueba: simula un mensaje de cliente entrante sin
  // necesitar un segundo celular. Usa el chat propio del dueño como "cliente"
  // de prueba (se aprueba automáticamente) para que la respuesta del bot se
  // vea en el chat contigo mismo, sin tocar a ningún cliente real.
  app.post('/admin/simular-mensaje', async (req, reply) => {
    const { texto } = (req.body as { texto?: string } | undefined) ?? {};
    const socket = getSocket();
    const ownJid = socket.info?.wid?._serialized;
    if (!ownJid) {
      return reply.code(503).send({ ok: false, error: 'cliente sin usuario todavía' });
    }
    const numeroPrueba = ownJid.split('@')[0];
    await db.cliente.upsert({
      where: { numeroWhatsapp: numeroPrueba },
      update: { aprobado: true, requiereAtencion: false, motivoAtencion: null },
      create: { numeroWhatsapp: numeroPrueba, nombre: 'Prueba automática', aprobado: true },
    });

    await manejarMensajeDeCliente(
      socket,
      ownJid,
      ownJid,
      'Prueba automática',
      texto ?? 'Hola, quiero 2 kilos de chuleta y 1 kilo de chorizo',
      `sim-${Date.now()}`,
    );
    return { ok: true };
  });

  return app;
}
