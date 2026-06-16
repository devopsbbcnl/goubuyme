'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const NAV = [
  { href: '/rider', icon: '📊', label: 'Dashboard' },
  { href: '/rider/jobs', icon: '🏍️', label: 'Jobs' },
  { href: '/rider/active', icon: '📍', label: 'Active' },
  { href: '/rider/earnings', icon: '💰', label: 'Earnings' },
  { href: '/rider/profile', icon: '👤', label: 'Profile' },
];

export function RiderNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <header className="r-topbar">
        <div className="inner">
          <Link href="/" className="logo" style={{ fontSize: 20 }}>
            <span className="go">Go</span><span className="buy">Buy</span><span className="me">Me</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Rider Portal</span>
            {user && (
              <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                {user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name ?? 'R')}
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="r-bottom-nav">
        {NAV.map(n => {
          const active = n.href === '/rider' ? pathname === '/rider' : pathname?.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`r-nav-item${active ? ' active' : ''}`}>
              <span style={{ fontSize: 20 }}>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
