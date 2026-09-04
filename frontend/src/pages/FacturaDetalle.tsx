import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatoCOP, type Factura } from '../api';

export default function FacturaDetalle() {
  const { id } = useParams<{ id: string }>();
  const [factura, setFactura] = useState<Factura | null>(null);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState(false);

  const cargar = async () => {
    if (!id) return;
    setCargando(true);
    setFactura(await api.factura(id));
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, [id]);

  const marcarPagada = async () => {
    if (!id) return;
    setMarcando(true);
    try {
      await api.marcarPagada(id);
      await cargar();
    } finally {
      setMarcando(false);
    }
  };

  if (cargando || !factura) return <p className="text-gray-400">Cargando...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6 print:hidden">
        <h1 className="text-white text-2xl font-bold">Factura</h1>
        <div className="space-x-3">
          {factura.estado === 'pendiente' && (
            <button
              onClick={marcarPagada}
              disabled={marcando}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md"
            >
              {marcando ? 'Marcando...' : 'Marcar como pagada'}
            </button>
          )}
          <button onClick={() => window.print()} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md">
            Imprimir
          </button>
        </div>
      </div>

      <div className="bg-white text-black rounded-lg p-8 print:p-0 print:rounded-none">
        <div className="flex justify-between items-start border-b border-gray-300 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-bold">D'Carnes Colombia</h2>
            <p className="text-sm text-gray-600">Proveedor de carnes</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Factura {factura.tipo === 'electronica' ? 'electrónica' : 'normal'}</p>
            <p className="text-xs text-gray-500">#{factura.id.slice(0, 8)}</p>
            <p className="text-xs text-gray-500">{new Date(factura.creadoEn).toLocaleString('es-CO')}</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600">Cliente</p>
          <p className="font-medium">{factura.cliente?.nombre}</p>
          <p className="text-sm text-gray-600">{factura.cliente?.numeroWhatsapp}</p>
        </div>

        <table className="w-full text-left mb-4">
          <thead>
            <tr className="border-b border-gray-300 text-sm text-gray-600">
              <th className="py-2">Producto</th>
              <th className="py-2">Kilos</th>
              <th className="py-2">Precio/kg</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {factura.pedidos?.map((p) => (
              <tr key={p.id} className="border-b border-gray-200">
                <td className="py-2">{p.producto.nombre}</td>
                <td className="py-2">{p.kilos} kg</td>
                <td className="py-2">{formatoCOP(p.precioUnitKg)}</td>
                <td className="py-2 text-right">{formatoCOP(Number(p.kilos) * Number(p.precioUnitKg))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="text-right">
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-2xl font-bold">{formatoCOP(factura.total)}</p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-300 text-sm text-gray-600">
          Estado: {factura.estado === 'pagada' ? `Pagada el ${new Date(factura.pagadaEn!).toLocaleDateString('es-CO')}` : 'Pendiente de pago'}
        </div>
      </div>
    </div>
  );
}
