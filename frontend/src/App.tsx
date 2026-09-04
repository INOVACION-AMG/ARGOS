import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Layout from './Layout';
import Login from './pages/Login';
import Clientes from './pages/Clientes';
import ClienteDetalle from './pages/ClienteDetalle';
import Catalogo from './pages/Catalogo';
import Facturas from './pages/Facturas';
import FacturaDetalle from './pages/FacturaDetalle';
import FacturasCompra from './pages/FacturasCompra';
import PanelEmpleado from './pages/PanelEmpleado';

function RutaProtegida({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={usuario?.rol === 'empleado' ? '/panel-empleado' : '/clientes'} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RutaProtegida>
                <Layout />
              </RutaProtegida>
            }
          >
            <Route path="/" element={<Inicio />} />
            <Route path="/panel-empleado" element={<PanelEmpleado />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<ClienteDetalle />} />
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/facturas" element={<Facturas />} />
            <Route path="/facturas/:id" element={<FacturaDetalle />} />
            <Route path="/compras" element={<FacturasCompra />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
