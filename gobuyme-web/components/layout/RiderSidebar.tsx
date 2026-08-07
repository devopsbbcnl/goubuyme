'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const NAV = [
  { href: '/rider', icon: '📊', label: 'Dashboard' },
  { href: '/rider/jobs', icon: '🏍️', label: 'Available Jobs' },
  { href: '/rider/active', icon: '📍', label: 'Active Delivery' },
  { href: '/rider/earnings', icon: '💰', label: 'Earnings' },
  { href: '/rider/profile', icon: '👤', label: 'Profile' },
];

interface SidebarProps { isOpen?: boolean; onClose?: () => void; }

export function RiderSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    api.get('/riders/me')
      .then(r => {
        setVehicleType(r.data.data?.vehicleType ?? null);
        setIsOnline(r.data.data?.isOnline ?? false);
      })
      .catch(() => {});
  }, []);

  const signOut = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
  };

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      {isOpen && <div className="v-overlay" onClick={onClose} />}
      <aside className={`v-side r-side${isOpen ? ' is-open' : ''}`}>
        <div className="v-side-logo">
          <Link href="/" className="logo" style={{ padding: 0 }}>
            <Image src="/images/logo.png" alt="GoBuyMe" width={120} height={32} style={{ objectFit: 'contain', height: 32, width: 'auto' }} priority />
          </Link>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>Rider Portal</div>
        </div>

        {user && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div className="avatar" style={{ width: 40, height: 40, fontSize: 13, border: '2px solid var(--line)' }}>
                  {user.avatar
                    ? <img src={user.avatar} alt={user.name ?? 'rider'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials(user.name ?? 'R')
                  }
                </div>
                <span
                  title={isOnline ? 'Online' : 'Offline'}
                  style={{
                    position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%',
                    background: isOnline ? 'var(--success)' : 'var(--muted)', border: '2px solid var(--surface)',
                  }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name}
                </div>
                <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {vehicleType ? vehicleType.charAt(0) + vehicleType.slice(1).toLowerCase() : user.email}
                </div>
              </div>
            </div>
          </div>
        )}

        <nav className="v-side-nav">
          <div className="v-nav-section">Main</div>
          {NAV.map(n => {
            const active = n.href === '/rider' ? pathname === '/rider' : pathname?.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`v-nav-item${active ? ' active' : ''}`} onClick={onClose}>
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
          <div className="v-nav-section">Account</div>
          <button className="v-nav-item w-full" style={{ color: 'var(--error)', justifyContent: 'flex-start' }} onClick={signOut}>
            <span>🚪</span><span>Sign Out</span>
          </button>
        </nav>
      </aside>
    </>
  );
}
