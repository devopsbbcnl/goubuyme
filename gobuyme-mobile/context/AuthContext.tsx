import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setActiveVendorId } from '@/services/vendorLocation';
import api from '@/services/api';
import { disconnectSockets } from '@/services/socketService';

export type UserRole = 'customer' | 'vendor' | 'rider' | 'logistics_company' | null;

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  photoPosition?: string;
  role: UserRole;
  token: string;
  approvalStatus?: ApprovalStatus;
}

type AuthCtx = {
  user: AuthUser | null;
  role: UserRole;
  loading: boolean;
  login: (user: AuthUser, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<Pick<AuthUser, 'name' | 'phone' | 'photoUrl' | 'photoPosition'>>) => Promise<void>;
  updateApprovalStatus: (status: ApprovalStatus) => void;
  /** Switch the active experience (same account). Throws if the role isn't available. */
  switchRole: (target: 'customer' | 'vendor' | 'rider') => Promise<void>;
  /** Register a vendor or rider profile on this account and switch into it. */
  addRole: (payload: Record<string, unknown>) => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  role: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  updateUser: async () => {},
  updateApprovalStatus: () => {},
  switchRole: async () => {},
  addRole: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [token, profileJson] = await Promise.all([
          SecureStore.getItemAsync('accessToken'),
          SecureStore.getItemAsync('userProfile'),
        ]);
        if (token && profileJson) {
          const profile = JSON.parse(profileJson);
          setUser({ ...profile, token });
        }
      } catch {
        // session unreadable — user re-authenticates
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (u: AuthUser, refreshToken: string) => {
    await Promise.all([
      SecureStore.setItemAsync('accessToken', u.token),
      SecureStore.setItemAsync('refreshToken', refreshToken),
      SecureStore.setItemAsync('userProfile', JSON.stringify({
        id: u.id, name: u.name, email: u.email, role: u.role,
        phone: u.phone ?? '', photoUrl: u.photoUrl ?? '', photoPosition: u.photoPosition ?? '',
        approvalStatus: u.approvalStatus ?? null,
      })),
    ]);
    setUser(u);
  };

  const logout = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync('accessToken'),
      SecureStore.deleteItemAsync('refreshToken'),
      SecureStore.deleteItemAsync('userProfile'),
    ]);
    await setActiveVendorId(null);
    setUser(null);
  };

  // Turns a switch-role / add-role response into the stored session. Same account and user id;
  // only the active role (and its tokens) change. Sockets reconnect so they carry the new role.
  const applyRoleSession = async (data: {
    user: { id: string; name: string; email: string; phone?: string | null; avatar?: string | null; avatarPosition?: string | null; role: string; approvalStatus?: ApprovalStatus };
    accessToken: string; refreshToken: string;
  }) => {
    disconnectSockets();
    await setActiveVendorId(null);
    await login({
      id: data.user.id, name: data.user.name, email: data.user.email,
      role: data.user.role.toLowerCase() as UserRole, token: data.accessToken,
      approvalStatus: data.user.approvalStatus,
      phone: data.user.phone ?? undefined,
      photoUrl: data.user.avatar ?? user?.photoUrl,
      photoPosition: data.user.avatarPosition ?? user?.photoPosition,
    }, data.refreshToken);
  };

  const switchRole = async (target: 'customer' | 'vendor' | 'rider') => {
    const res = await api.post('/auth/switch-role', { role: target.toUpperCase() });
    await applyRoleSession(res.data.data);
  };

  const addRole = async (payload: Record<string, unknown>) => {
    const res = await api.post('/auth/add-role', payload);
    await applyRoleSession(res.data.data);
  };

  const updateApprovalStatus = (status: ApprovalStatus) => {
    if (!user) return;
    setUser({ ...user, approvalStatus: status });
  };

  const updateUser = async (patch: Partial<Pick<AuthUser, 'name' | 'phone' | 'photoUrl' | 'photoPosition'>>) => {
    if (!user) return;
    const updated = { ...user, ...patch };
    setUser(updated);
    await SecureStore.setItemAsync('userProfile', JSON.stringify({
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      phone: updated.phone ?? '', photoUrl: updated.photoUrl ?? '', photoPosition: updated.photoPosition ?? '',
    }));
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, loading, login, logout, updateUser, updateApprovalStatus, switchRole, addRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
