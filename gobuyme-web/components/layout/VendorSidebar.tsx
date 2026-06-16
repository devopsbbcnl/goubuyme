'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const NAV = [
  { href: '/vendor', icon: '📊', label: 'Dashboard' },
  { href: '/vendor/orders', icon: '📦', label: 'Orders' },
  { href: '/vendor/menu', icon: '🍽️', label: 'Menu' },
  { href: '/vendor/promotions', icon: '🎁', label: 'Promotions' },
  { href: '/vendor/earnings', icon: '💰', label: 'Earnings' },
  { href: '/vendor/profile', icon: '🏪', label: 'Store Profile' },
  { href: '/vendor/settings', icon: '⚙️', label: 'Settings' },
];

export function VendorSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const toast = useToast();

  const signOut = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
  };

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className="v-side">
      <div className="v-side-logo">
        <Link href="/" className="logo" style={{ fontSize: 20 }}>
          <span className="go">Go</span><span className="buy">Buy</span><span className="me">Me</span>
        </Link>
        <div className="muted" style={{ fontSize: 11, marginTop: 2, fontWeight: 600 }}>Vendor Portal</div>
      </div>

      {user && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
              {user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name ?? 'V')}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{user.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{user.email}</div>
            </div>
          </div>
        </div>
      )}

      <nav className="v-side-nav">
        <div className="v-nav-section">Main</div>
        {NAV.map(n => {
          const active = n.href === '/vendor' ? pathname === '/vendor' : pathname?.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`v-nav-item${active ? ' active' : ''}`}>
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
  );
}
