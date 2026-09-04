import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const linkClase = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-800'
  }`;

export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const esEmpleado = usuario?.rol === 'empleado';

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-4 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">D'Carnes</span>
          {esEmpleado ? (
            <NavLink to="/panel-empleado" className={linkClase}>
              Mi ruta
            </NavLink>
          ) : (
            <>
              <NavLink to="/clientes" className={linkClase}>
                Clientes
              </NavLink>
              <NavLink to="/catalogo" className={linkClase}>
                Catálogo
              </NavLink>
              <NavLink to="/facturas" className={linkClase}>
                Facturas
              </NavLink>
              <NavLink to="/compras" className={linkClase}>
                Compras
              </NavLink>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>
            {usuario?.nombre} ({usuario?.rol})
          </span>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="text-gray-400 hover:text-white"
          >
            Salir
          </button>
        </div>
      </nav>
      <main className="p-6 max-w-5xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
