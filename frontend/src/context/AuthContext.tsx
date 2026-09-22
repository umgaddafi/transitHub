/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types/user';
import { authService, sessionToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: { name: string; email: string; phone: string; password: string; password_confirmation: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(sessionToken.get()));

  useEffect(() => {
    let active = true;
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);

    if (sessionToken.get()) {
      authService
        .me()
        .then(value => {
          if (active) setUser(value);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      window.removeEventListener('session-expired', expired);
    };
  }, []);

  const login: AuthContextType['login'] = async (email, password) => {
    const data = await authService.login(email, password);
    sessionToken.set(data.token);
    setUser(data.user);
    return data.user;
  };

  const register: AuthContextType['register'] = async payload => {
    const data = await authService.register(payload);
    sessionToken.set(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      sessionToken.clear();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
