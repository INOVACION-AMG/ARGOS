import { createContext, useContext, useState, type ReactNode } from 'react';
import { getToken, setToken, type Usuario } from './api';

interface AuthState {
  usuario: Usuario | null;
  login: (token: string, usuario: Usuario) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const guardado = localStorage.getItem('usuario');
    return guardado ? (JSON.parse(guardado) as Usuario) : null;
  });

  const login = (token: string, u: Usuario) => {
    setToken(token);
    localStorage.setItem('usuario', JSON.stringify(u));
    setUsuario(u);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('usuario');
    setUsuario(null);
  };

  return <AuthContext.Provider value={{ usuario, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export function estaAutenticado() {
  return Boolean(getToken());
}
