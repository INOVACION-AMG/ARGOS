import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Cliente } from '../api';

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .clientes()
      .then(setClientes)
      .finally(() => setCargando(false));
  }, []);

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Clientes</h1>
      {cargando ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <table className="w-full text-left text-gray-200">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-sm">
              <th className="py-2">Nombre</th>
              <th className="py-2">WhatsApp</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Pedidos sin facturar</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-gray-900">
                <td className="py-2">{c.nombre}</td>
                <td className="py-2">{c.numeroWhatsapp}</td>
                <td className="py-2">
                  {c.requiereAtencion ? (
                    <span className="text-yellow-400">Requiere atención</span>
                  ) : c.aprobado ? (
                    <span className="text-green-400">Aprobado</span>
                  ) : (
                    <span className="text-gray-500">Sin aprobar</span>
                  )}
                </td>
                <td className="py-2">
                  {c.pedidosPendientes > 0 ? (
                    <span className="text-orange-400 font-medium">{c.pedidosPendientes}</span>
                  ) : (
                    <span className="text-gray-600">0</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Link to={`/clientes/${c.id}`} className="text-orange-400 hover:text-orange-300">
                    Ver pedidos →
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
