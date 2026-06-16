'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setUnauthorizedHandler } from '@/services/api';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: 'customer' | 'vendor' | 'rider' | null;
  token: string;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (user: AuthUser, refresh: string) => void;
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: () => {}, logout: () => {}, updateUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gbm_user');
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace('/login');
    });
  }, [router]);

  const login = (u: AuthUser, refresh: string) => {
    localStorage.setItem('gbm_access', u.token);
    localStorage.setItem('gbm_refresh', refresh);
    localStorage.setItem('gbm_user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('gbm_access');
    localStorage.removeItem('gbm_refresh');
    localStorage.removeItem('gbm_user');
    setUser(null);
    router.replace('/');
  };

  const updateUser = (patch: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem('gbm_user', JSON.stringify(next));
      return next;
    });
  };

  return <Ctx.Provider value={{ user, loading, login, logout, updateUser }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
