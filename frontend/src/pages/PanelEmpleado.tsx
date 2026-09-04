import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatoCOP, type Cliente, type Factura, type Producto } from '../api';
import { useAuth } from '../AuthContext';

interface LineaCarrito {
  productoId: string;
  nombre: string;
  kilos: number;
  precioUnitKg: number;
}

export default function PanelEmpleado() {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const [productoId, setProductoId] = useState('');
  const [kilos, setKilos] = useState('');
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [tipo, setTipo] = useState<'normal' | 'electronica'>('normal');

  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [misFacturasHoy, setMisFacturasHoy] = useState<Factura[]>([]);

  useEffect(() => {
    api.clientes().then(setClientes);
    api.productos().then(setProductos);
  }, []);

  useEffect(() => {
    if (!usuario) return;
    api.facturas(undefined, usuario.id).then((todas) => {
      const hoy = new Date().toDateString();
      setMisFacturasHoy(todas.filter((f) => new Date(f.creadoEn).toDateString() === hoy));
    });
  }, [usuario]);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.numeroWhatsapp.includes(q));
  }, [clientes, busquedaCliente]);

  const total = carrito.reduce((acc, l) => acc + l.kilos * l.precioUnitKg, 0);

  const agregarProducto = () => {
    const producto = productos.find((p) => p.id === productoId);
    const kilosNum = Number(kilos);
    if (!producto || !kilosNum || kilosNum <= 0) return;
    setCarrito((c) => [
      ...c,
      { productoId: producto.id, nombre: producto.nombre, kilos: kilosNum, precioUnitKg: Number(producto.precioActual) },
    ]);
    setProductoId('');
    setKilos('');
  };

  const quitarLinea = (idx: number) => setCarrito((c) => c.filter((_, i) => i !== idx));

  const generarFactura = async () => {
    if (!clienteSeleccionado || carrito.length === 0) return;
    setError(null);
    setGenerando(true);
    try {
      const factura = await api.ventaDirecta(
        clienteSeleccionado.id,
        carrito.map((l) => ({ productoId: l.productoId, kilos: l.kilos, precioUnitKg: l.precioUnitKg })),
        tipo,
      );
      navigate(`/facturas/${factura.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerando(false);
    }
  };

  const cambiarCliente = () => {
    setClienteSeleccionado(null);
    setCarrito([]);
    setError(null);
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-white text-xl font-bold mb-1">Ruta — {usuario?.nombre}</h1>
      <p className="text-gray-400 text-sm mb-6">Factura al cliente que tenés al frente y entregale el ticket.</p>

      {!clienteSeleccionado ? (
        <div>
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={busquedaCliente}
            onChange={(e) => setBusquedaCliente(e.target.value)}
            className="w-full mb-3 px-3 py-3 rounded-md bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-orange-500"
          />
          <div className="space-y-2">
            {clientesFiltrados.map((c) => (
              <button
                key={c.id}
                onClick={() => setClienteSeleccionado(c)}
                className="w-full text-left bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-orange-500"
              >
                <p className="text-white font-medium">{c.nombre}</p>
                <p className="text-gray-500 text-sm">{c.numeroWhatsapp}</p>
              </button>
            ))}
            {clientesFiltrados.length === 0 && <p className="text-gray-500 text-sm">Sin resultados.</p>}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded-lg p-3 mb-4">
            <div>
              <p className="text-white font-medium">{clienteSeleccionado.nombre}</p>
              <p className="text-gray-500 text-sm">{clienteSeleccionado.numeroWhatsapp}</p>
            </div>
            <button onClick={cambiarCliente} className="text-orange-400 text-sm hover:text-orange-300">
              Cambiar
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-4">
            <label className="block text-sm text-gray-400 mb-1">Producto</label>
            <select
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700"
            >
              <option value="">Seleccionar...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — {formatoCOP(p.precioActual)}/{p.unidad}
                </option>
              ))}
            </select>
            <label className="block text-sm text-gray-400 mb-1">Kilos</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={kilos}
                onChange={(e) => setKilos(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700"
              />
              <button
                onClick={agregarProducto}
                disabled={!productoId || !kilos}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 rounded-md"
              >
                Agregar
              </button>
            </div>
          </div>

          {carrito.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-4">
              {carrito.map((l, idx) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-white text-sm">{l.nombre}</p>
                    <p className="text-gray-500 text-xs">
                      {l.kilos} kg × {formatoCOP(l.precioUnitKg)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-200 text-sm">{formatoCOP(l.kilos * l.precioUnitKg)}</span>
                    <button onClick={() => quitarLinea(idx)} className="text-red-400 text-sm hover:text-red-300">
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-700">
                <span className="text-gray-300 font-medium">Total</span>
                <span className="text-white font-bold">{formatoCOP(total)}</span>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1">Tipo de factura</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'normal' | 'electronica')}
              className="w-full px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700"
            >
              <option value="normal">Normal</option>
              <option value="electronica">Electrónica</option>
            </select>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <button
            onClick={generarFactura}
            disabled={carrito.length === 0 || generando}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-3 rounded-md"
          >
            {generando ? 'Generando...' : 'Generar factura e imprimir'}
          </button>
        </div>
      )}

      {misFacturasHoy.length > 0 && (
        <div className="mt-8">
          <h2 className="text-gray-400 text-sm font-medium mb-2">Mis facturas de hoy ({misFacturasHoy.length})</h2>
          <div className="space-y-1">
            {misFacturasHoy.map((f) => (
              <button
                key={f.id}
                onClick={() => navigate(`/facturas/${f.id}`)}
                className="w-full text-left flex justify-between text-sm bg-gray-900 border border-gray-800 rounded-md px-3 py-2 hover:border-orange-500"
              >
                <span className="text-gray-300">{f.cliente?.nombre}</span>
                <span className="text-gray-400">{formatoCOP(f.total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
