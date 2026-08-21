'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { setUnauthorizedHandler } from '@/services/api';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: 'customer' | 'vendor' | 'rider' | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (user: AuthUser) => void;
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
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const body = await res.json();
        const u = body?.data;
        if (!u) return;

        const base: AuthUser = {
          id: u.id, name: u.name, email: u.email,
          phone: u.phone, avatar: u.avatar,
          role: u.role?.toLowerCase() ?? null,
        };

        // /auth/me doesn't include approvalStatus (only /auth/login computes it) —
        // fetch it separately for vendors/riders so the dashboard banner stays accurate.
        if (base.role === 'vendor' || base.role === 'rider') {
          try {
            const { data } = await api.get('/auth/activation-status');
            base.approvalStatus = data.data.approvalStatus;
          } catch { /* keep base user without approvalStatus; screens re-check as needed */ }
        }

        setUser(base);
      } catch { /* not logged in */ }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace('/login');
    });
  }, [router]);

  const login = (u: AuthUser) => setUser(u);

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    router.replace('/');
  };

  const updateUser = (patch: Partial<AuthUser>) => {
    setUser(prev => (prev ? { ...prev, ...patch } : prev));
  };

  return <Ctx.Provider value={{ user, loading, login, logout, updateUser }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
