import { useEffect, useState } from 'react';
import { api, formatoCOP, type FacturaCompra, type LineaFacturaCompra, type Producto } from '../api';

interface LineaEditable extends LineaFacturaCompra {
  productoId: string;
}

function mejorCoincidencia(nombreLeido: string, productos: Producto[]): string {
  const normalizado = nombreLeido.trim().toLowerCase();
  const match = productos.find(
    (p) => p.nombre.toLowerCase().includes(normalizado) || normalizado.includes(p.nombre.toLowerCase()),
  );
  return match?.id ?? '';
}

export default function FacturasCompra() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [historial, setHistorial] = useState<FacturaCompra[]>([]);
  const [proveedor, setProveedor] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [extrayendo, setExtrayendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    const [p, h] = await Promise.all([api.productos(), api.facturasCompra()]);
    setProductos(p);
    setHistorial(h);
  };

  useEffect(() => {
    cargar();
  }, []);

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setExtrayendo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const extraida = await api.extraerFacturaCompra(base64, file.type || 'image/jpeg');
      setProveedor(extraida.proveedor ?? '');
      setLineas(
        extraida.items.map((item) => ({
          ...item,
          productoId: mejorCoincidencia(item.nombreLeido, productos),
        })),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtrayendo(false);
      e.target.value = '';
    }
  };

  const actualizarLinea = (idx: number, cambios: Partial<LineaEditable>) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...cambios } : l)));
  };

  const confirmar = async () => {
    if (!proveedor || lineas.length === 0) return;
    const items = lineas.filter((l) => l.productoId).map((l) => ({ productoId: l.productoId, kilos: l.kilos, costoUnitKg: l.costoUnitKg }));
    if (items.length < lineas.length) {
      setError('Hay líneas sin producto asignado del catálogo — asígnalas o bórralas antes de confirmar.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.crearFacturaCompra(proveedor, items);
      setProveedor('');
      setLineas([]);
      await cargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Facturas de compra (inventario)</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-8">
        <label className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md cursor-pointer">
          {extrayendo ? 'Leyendo factura...' : '📷 Fotografiar / subir factura de compra'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onArchivo} disabled={extrayendo} />
        </label>

        {lineas.length > 0 && (
          <div className="mt-6">
            <label className="block text-sm text-gray-400 mb-1">Proveedor</label>
            <input
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              className="mb-4 px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700 w-full max-w-sm"
              placeholder="Nombre del proveedor"
            />

            <table className="w-full text-left text-gray-200 mb-4">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-sm">
                  <th className="py-2">Leído en la factura</th>
                  <th className="py-2">Producto del catálogo</th>
                  <th className="py-2">Kilos</th>
                  <th className="py-2">Costo/kg</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, idx) => (
                  <tr key={idx} className="border-b border-gray-900">
                    <td className="py-2 text-gray-400">{l.nombreLeido}</td>
                    <td className="py-2">
                      <select
                        value={l.productoId}
                        onChange={(e) => actualizarLinea(idx, { productoId: e.target.value })}
                        className={`px-2 py-1 rounded bg-gray-800 border text-white ${
                          l.productoId ? 'border-gray-700' : 'border-red-600'
                        }`}
                      >
                        <option value="">-- asignar producto --</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={l.kilos}
                        onChange={(e) => actualizarLinea(idx, { kilos: Number(e.target.value) })}
                        className="w-20 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-white"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={l.costoUnitKg ?? ''}
                        onChange={(e) => actualizarLinea(idx, { costoUnitKg: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {error && <p className="text-red-400 mb-3">{error}</p>}

            <button
              onClick={confirmar}
              disabled={guardando}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-md"
            >
              {guardando ? 'Guardando...' : 'Confirmar y actualizar inventario'}
            </button>
          </div>
        )}
        {error && lineas.length === 0 && <p className="text-red-400 mt-3">{error}</p>}
      </div>

      <h2 className="text-white text-lg font-bold mb-3">Historial de compras</h2>
      {historial.length === 0 ? (
        <p className="text-gray-400">Todavía no hay facturas de compra registradas.</p>
      ) : (
        <table className="w-full text-left text-gray-200">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-sm">
              <th className="py-2">Proveedor</th>
              <th className="py-2">Productos</th>
              <th className="py-2">Total</th>
              <th className="py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((f) => (
              <tr key={f.id} className="border-b border-gray-900">
                <td className="py-2">{f.proveedor}</td>
                <td className="py-2 text-sm text-gray-400">
                  {f.items.map((i) => `${i.producto.nombre} (${i.kilos}kg)`).join(', ')}
                </td>
                <td className="py-2">{f.total ? formatoCOP(f.total) : '—'}</td>
                <td className="py-2 text-gray-500 text-sm">{new Date(f.creadoEn).toLocaleString('es-CO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
