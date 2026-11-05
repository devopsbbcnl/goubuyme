'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const NAV = [
  { href: '/company', icon: '📊', label: 'Overview' },
  { href: '/company/fleet', icon: '🏍️', label: 'Fleet' },
  { href: '/company/deliveries', icon: '📦', label: 'Deliveries' },
  { href: '/company/account', icon: '🏢', label: 'Company' },
];

interface SidebarProps { isOpen?: boolean; onClose?: () => void; }

export function CompanySidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const signOut = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
  };

  return (
    <>
      {isOpen && <div className="v-overlay" onClick={onClose} />}
      <aside className={`v-side r-side${isOpen ? ' is-open' : ''}`}>
        <div className="v-side-logo">
          <Link href="/" className="logo" style={{ padding: 0 }}>
            <Image src="/images/logo.png" alt="GoBuyMe" width={120} height={32} style={{ objectFit: 'contain', height: 32, width: 'auto' }} priority />
          </Link>
          <div className="muted" style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>Logistics Portal</div>
        </div>

        {user && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
            <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
          </div>
        )}

        <nav className="v-side-nav">
          <div className="v-nav-section">Main</div>
          {NAV.map(n => {
            const active = n.href === '/company' ? pathname === '/company' : pathname?.startsWith(n.href);
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
