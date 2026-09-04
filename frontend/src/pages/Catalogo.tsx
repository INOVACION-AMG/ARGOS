import { useEffect, useState } from 'react';
import { api, formatoCOP, type Producto } from '../api';

export default function Catalogo() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editPrecio, setEditPrecio] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      setProductos(await api.productos());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !precio) return;
    await api.crearProducto(nombre, Number(precio));
    setNombre('');
    setPrecio('');
    cargar();
  };

  const empezarEdicion = (p: Producto) => {
    setEditandoId(p.id);
    setEditNombre(p.nombre);
    setEditPrecio(String(p.precioActual));
  };

  const guardarEdicion = async (id: string) => {
    await api.editarProducto(id, { nombre: editNombre, precioActual: Number(editPrecio) });
    setEditandoId(null);
    cargar();
  };

  const eliminar = async (p: Producto) => {
    if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return;
    try {
      await api.eliminarProducto(p.id);
      cargar();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Catálogo de productos</h1>

      <form onSubmit={agregar} className="flex gap-2 mb-6">
        <input
          placeholder="Nombre del producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="flex-1 px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700"
        />
        <input
          placeholder="Precio/kg"
          type="number"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          className="w-32 px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700"
        />
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md">
          Agregar
        </button>
      </form>

      {error && <p className="text-red-400 mb-4">{error}</p>}
      {cargando ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <table className="w-full text-left text-gray-200">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-sm">
              <th className="py-2">Producto</th>
              <th className="py-2">Precio/kg</th>
              <th className="py-2">Existencia</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-b border-gray-900">
                {editandoId === p.id ? (
                  <>
                    <td className="py-2">
                      <input
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-white"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={editPrecio}
                        onChange={(e) => setEditPrecio(e.target.value)}
                        className="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-white"
                      />
                    </td>
                    <td className="py-2 text-gray-500">{Number(p.existenciaKg)} kg</td>
                    <td className="py-2 text-right space-x-2">
                      <button onClick={() => guardarEdicion(p.id)} className="text-green-400 hover:text-green-300">
                        Guardar
                      </button>
                      <button onClick={() => setEditandoId(null)} className="text-gray-400 hover:text-gray-300">
                        Cancelar
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2">{p.nombre}</td>
                    <td className="py-2">{formatoCOP(p.precioActual)}/kg</td>
                    <td className={`py-2 ${Number(p.existenciaKg) <= 0 ? 'text-red-400' : 'text-gray-200'}`}>
                      {Number(p.existenciaKg)} kg
                    </td>
                    <td className="py-2 text-right space-x-3">
                      <button onClick={() => empezarEdicion(p)} className="text-orange-400 hover:text-orange-300">
                        Editar
                      </button>
                      <button onClick={() => eliminar(p)} className="text-red-400 hover:text-red-300">
                        Eliminar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
