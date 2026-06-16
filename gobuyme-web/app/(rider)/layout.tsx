'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RiderNav } from '@/components/layout/RiderNav';

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login');
      else if (user.role !== 'rider') router.replace('/home');
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'rider') return null;

  return (
    <div className="r-shell">
      <RiderNav />
      <main className="r-content">
        {children}
      </main>
    </div>
  );
}
