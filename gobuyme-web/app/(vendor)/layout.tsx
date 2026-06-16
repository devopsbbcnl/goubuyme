'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { VendorSidebar } from '@/components/layout/VendorSidebar';

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login');
      else if (user.role !== 'vendor') router.replace('/home');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'vendor') return null;

  return (
    <div className="v-shell">
      <VendorSidebar />
      <div className="v-main">
        <header className="v-topbar">
          <div className="inner">
            <div style={{ fontWeight: 700, fontSize: 15 }}>Vendor Dashboard</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Welcome back, {user.name?.split(' ')[0]}</div>
          </div>
        </header>
        <div className="v-content">
          {children}
        </div>
      </div>
    </div>
  );
}
