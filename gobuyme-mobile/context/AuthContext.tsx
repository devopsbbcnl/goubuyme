import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'customer' | 'vendor' | 'rider' | null;

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
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
  updateUser: (patch: Partial<Pick<AuthUser, 'name' | 'phone' | 'photoUrl'>>) => Promise<void>;
  updateApprovalStatus: (status: ApprovalStatus) => void;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  role: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  updateUser: async () => {},
  updateApprovalStatus: () => {},
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
        phone: u.phone ?? '', photoUrl: u.photoUrl ?? '',
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
    setUser(null);
  };

  const updateApprovalStatus = (status: ApprovalStatus) => {
    if (!user) return;
    setUser({ ...user, approvalStatus: status });
  };

  const updateUser = async (patch: Partial<Pick<AuthUser, 'name' | 'phone' | 'photoUrl'>>) => {
    if (!user) return;
    const updated = { ...user, ...patch };
    setUser(updated);
    await SecureStore.setItemAsync('userProfile', JSON.stringify({
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      phone: updated.phone ?? '', photoUrl: updated.photoUrl ?? '',
    }));
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, loading, login, logout, updateUser, updateApprovalStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
