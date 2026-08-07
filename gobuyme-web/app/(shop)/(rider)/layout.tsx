'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RiderSidebar } from '@/components/layout/RiderSidebar';

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login');
      else if (user.role !== 'rider') router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'rider') return null;

  return (
    <div className="v-shell">
      <RiderSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="v-main">
        <header className="v-topbar">
          <div className="inner">
            <button className="v-ham" onClick={() => setSidebarOpen(o => !o)} aria-label="Open menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Rider Dashboard</div>
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
