import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatoCOP, type Factura } from '../api';

export default function Facturas() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [filtro, setFiltro] = useState<'todas' | 'pendiente' | 'pagada'>('todas');
  const [cargando, setCargando] = useState(true);

  const cargar = async (f: typeof filtro) => {
    setCargando(true);
    setFacturas(await api.facturas(f === 'todas' ? undefined : f));
    setCargando(false);
  };

  useEffect(() => {
    cargar(filtro);
  }, [filtro]);

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Facturas</h1>

      <div className="flex gap-2 mb-6">
        {(['todas', 'pendiente', 'pagada'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded-md text-sm ${
              filtro === f ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {f === 'todas' ? 'Todas' : f === 'pendiente' ? 'Pendientes' : 'Pagadas'}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-gray-400">Cargando...</p>
      ) : facturas.length === 0 ? (
        <p className="text-gray-400">No hay facturas.</p>
      ) : (
        <table className="w-full text-left text-gray-200">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-sm">
              <th className="py-2">Cliente</th>
              <th className="py-2">Tipo</th>
              <th className="py-2">Total</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Generado por</th>
              <th className="py-2">Fecha</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id} className="border-b border-gray-900">
                <td className="py-2">{f.cliente?.nombre}</td>
                <td className="py-2 capitalize">{f.tipo}</td>
                <td className="py-2">{formatoCOP(f.total)}</td>
                <td className="py-2">
                  {f.estado === 'pagada' ? (
                    <span className="text-green-400">Pagada</span>
                  ) : (
                    <span className="text-yellow-400">Pendiente</span>
                  )}
                </td>
                <td className="py-2 text-gray-400 text-sm">{f.creadoPor?.nombre ?? '—'}</td>
                <td className="py-2 text-gray-500 text-sm">{new Date(f.creadoEn).toLocaleString('es-CO')}</td>
                <td className="py-2 text-right">
                  <Link to={`/facturas/${f.id}`} className="text-orange-400 hover:text-orange-300">
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
