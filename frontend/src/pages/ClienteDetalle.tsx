import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatoCOP, type PedidoPendiente } from '../api';

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoPendiente[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<'normal' | 'electronica'>('normal');
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .pedidosPendientes(id)
      .then((p) => {
        setPedidos(p);
        setSeleccionados(new Set(p.map((x) => x.id)));
      })
      .finally(() => setCargando(false));
  }, [id]);

  const toggle = (pedidoId: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId);
      else next.add(pedidoId);
      return next;
    });
  };

  const total = pedidos
    .filter((p) => seleccionados.has(p.id))
    .reduce((acc, p) => acc + Number(p.kilos) * Number(p.precioUnitKg), 0);

  const generar = async () => {
    if (!id || seleccionados.size === 0) return;
    setGenerando(true);
    setError(null);
    try {
      const factura = await api.crearFactura(id, Array.from(seleccionados), tipo);
      navigate(`/facturas/${factura.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerando(false);
    }
  };

  if (cargando) return <p className="text-gray-400">Cargando...</p>;

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Pedidos pendientes de facturar</h1>

      {pedidos.length === 0 ? (
        <p className="text-gray-400">Este cliente no tiene pedidos sin facturar.</p>
      ) : (
        <>
          <table className="w-full text-left text-gray-200 mb-6">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-sm">
                <th className="py-2"></th>
                <th className="py-2">Producto</th>
                <th className="py-2">Kilos</th>
                <th className="py-2">Precio/kg</th>
                <th className="py-2">Subtotal</th>
                <th className="py-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-b border-gray-900">
                  <td className="py-2">
                    <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="py-2">{p.producto.nombre}</td>
                  <td className="py-2">{p.kilos} kg</td>
                  <td className="py-2">{formatoCOP(p.precioUnitKg)}</td>
                  <td className="py-2">{formatoCOP(Number(p.kilos) * Number(p.precioUnitKg))}</td>
                  <td className="py-2 text-gray-500 text-sm">{new Date(p.creadoEn).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div>
              <label className="text-gray-400 text-sm mr-2">Tipo de factura:</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'normal' | 'electronica')}
                className="bg-gray-800 text-white border border-gray-700 rounded-md px-2 py-1"
              >
                <option value="normal">Normal</option>
                <option value="electronica">Electrónica</option>
              </select>
              {tipo === 'electronica' && (
                <p className="text-yellow-500 text-xs mt-1">
                  La integración con TNFactor todavía no está conectada — se guarda marcada como electrónica, pero
                  no se envía a la DIAN automáticamente todavía.
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">Total ({seleccionados.size} pedidos)</p>
              <p className="text-white text-2xl font-bold">{formatoCOP(total)}</p>
            </div>
          </div>

          {error && <p className="text-red-400 mt-4">{error}</p>}

          <button
            onClick={generar}
            disabled={generando || seleccionados.size === 0}
            className="mt-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-md"
          >
            {generando ? 'Generando...' : 'Generar factura'}
          </button>
        </>
      )}
    </div>
  );
}
