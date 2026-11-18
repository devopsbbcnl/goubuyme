'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { setActiveLocationId, setUnauthorizedHandler } from '@/services/api';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  avatarPosition?: string | null;
  role: 'customer' | 'vendor' | 'rider' | 'logistics_company' | null;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  /** Switch the active experience on this account. Throws if the role isn't available. */
  switchRole: (target: 'customer' | 'vendor' | 'rider') => Promise<void>;
  /** Register a vendor or rider profile on this account and switch into it. */
  addRole: (payload: Record<string, unknown>) => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: () => {}, logout: () => {}, updateUser: () => {},
  switchRole: async () => {}, addRole: async () => {},
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
          phone: u.phone, avatar: u.avatar, avatarPosition: u.avatarPosition,
          role: u.role?.toLowerCase() ?? null,
        };

        // /auth/me doesn't include approvalStatus (only /auth/login computes it) —
        // fetch it separately for vendors/riders so the dashboard banner stays accurate.
        if (base.role === 'vendor' || base.role === 'rider' || base.role === 'logistics_company') {
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
    setActiveLocationId(null);
    setUser(null);
    router.replace('/');
  };

  const updateUser = (patch: Partial<AuthUser>) => {
    setUser(prev => (prev ? { ...prev, ...patch } : prev));
  };

  // The proxy lifts the new tokens out of the response into the httpOnly cookies, so the browser
  // only ever sees the user. Same account and id; only the active role changes.
  const applyRoleSession = (d: { user: { role: string; approvalStatus?: AuthUser['approvalStatus'] } }) => {
    setActiveLocationId(null);
    setUser(prev => prev ? {
      ...prev,
      role: d.user.role.toLowerCase() as AuthUser['role'],
      approvalStatus: d.user.approvalStatus,
    } : prev);
  };

  const switchRole = async (target: 'customer' | 'vendor' | 'rider') => {
    const { data } = await api.post('/auth/switch-role', { role: target.toUpperCase() });
    applyRoleSession(data.data);
  };

  const addRole = async (payload: Record<string, unknown>) => {
    const { data } = await api.post('/auth/add-role', payload);
    applyRoleSession(data.data);
  };

  return <Ctx.Provider value={{ user, loading, login, logout, updateUser, switchRole, addRole }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
