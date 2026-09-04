const API_BASE = 'http://localhost:3000';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.location.href = '/login';
    throw new Error('No autorizado');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `Error ${res.status}`);
  }
  return data as T;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  numeroWhatsapp: string;
  aprobado: boolean;
  requiereAtencion: boolean;
  pedidosPendientes: number;
}

export interface Producto {
  id: string;
  nombre: string;
  unidad: string;
  precioActual: string | number;
  existenciaKg: string | number;
  actualizadoEn: string;
}

export interface LineaFacturaCompra {
  nombreLeido: string;
  kilos: number;
  costoUnitKg?: number;
}

export interface FacturaCompraExtraida {
  proveedor?: string;
  items: LineaFacturaCompra[];
}

export interface FacturaCompraItem {
  id: string;
  productoId: string;
  kilos: string | number;
  costoUnitKg: string | number | null;
  producto: Producto;
}

export interface FacturaCompra {
  id: string;
  proveedor: string;
  total: string | number | null;
  creadoEn: string;
  items: FacturaCompraItem[];
}

export interface PedidoPendiente {
  id: string;
  kilos: string | number;
  precioUnitKg: string | number;
  creadoEn: string;
  producto: Producto;
}

export interface Factura {
  id: string;
  clienteId: string;
  tipo: 'normal' | 'electronica';
  estado: 'pendiente' | 'pagada';
  total: string | number;
  creadoEn: string;
  pagadaEn: string | null;
  cliente?: Cliente;
  pedidos?: PedidoPendiente[];
  creadoPorId?: string | null;
  creadoPor?: { id: string; nombre: string } | null;
}

export interface ItemVentaDirecta {
  productoId: string;
  kilos: number;
  precioUnitKg: number;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok: boolean; token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  clientes: () => request<Cliente[]>('/clientes'),
  pedidosPendientes: (clienteId: string) =>
    request<PedidoPendiente[]>(`/clientes/${clienteId}/pedidos-pendientes`),

  productos: () => request<Producto[]>('/productos'),
  crearProducto: (nombre: string, precioActual: number, unidad?: string) =>
    request<Producto>('/productos', { method: 'POST', body: JSON.stringify({ nombre, precioActual, unidad }) }),
  editarProducto: (id: string, datos: Partial<{ nombre: string; precioActual: number; unidad: string }>) =>
    request<Producto>(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(datos) }),
  eliminarProducto: (id: string) => request<{ ok: boolean }>(`/productos/${id}`, { method: 'DELETE' }),

  facturas: (estado?: string, creadoPorId?: string) => {
    const params = new URLSearchParams();
    if (estado) params.set('estado', estado);
    if (creadoPorId) params.set('creadoPorId', creadoPorId);
    const qs = params.toString();
    return request<Factura[]>(`/facturas${qs ? `?${qs}` : ''}`);
  },
  factura: (id: string) => request<Factura>(`/facturas/${id}`),
  crearFactura: (clienteId: string, pedidoIds: string[], tipo: 'normal' | 'electronica') =>
    request<Factura>('/facturas', { method: 'POST', body: JSON.stringify({ clienteId, pedidoIds, tipo }) }),
  ventaDirecta: (clienteId: string, items: ItemVentaDirecta[], tipo: 'normal' | 'electronica') =>
    request<Factura>('/facturas/venta-directa', { method: 'POST', body: JSON.stringify({ clienteId, items, tipo }) }),
  marcarPagada: (id: string) => request<Factura>(`/facturas/${id}/pagada`, { method: 'PATCH' }),

  extraerFacturaCompra: (imagenBase64: string, mediaType: string) =>
    request<FacturaCompraExtraida>('/facturas-compra/extraer', {
      method: 'POST',
      body: JSON.stringify({ imagenBase64, mediaType }),
    }),
  facturasCompra: () => request<FacturaCompra[]>('/facturas-compra'),
  crearFacturaCompra: (proveedor: string, items: { productoId: string; kilos: number; costoUnitKg?: number }[]) =>
    request<FacturaCompra>('/facturas-compra', { method: 'POST', body: JSON.stringify({ proveedor, items }) }),
};

export function formatoCOP(valor: string | number): string {
  return `$${Math.round(Number(valor)).toLocaleString('es-CO')}`;
}
