'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

const NAV = [
  { href: '/vendor', icon: '📊', label: 'Dashboard' },
  { href: '/vendor/orders', icon: '📦', label: 'Orders' },
  { href: '/vendor/menu', icon: '🍽️', label: 'Menu' },
  { href: '/vendor/promotions', icon: '🎁', label: 'Promotions' },
  { href: '/vendor/earnings', icon: '💰', label: 'Earnings' },
  { href: '/vendor/documents', icon: '📄', label: 'Documents' },
  { href: '/vendor/profile', icon: '🏪', label: 'Store Profile' },
  { href: '/vendor/settings', icon: '⚙️', label: 'Settings' },
];

interface SidebarProps { isOpen?: boolean; onClose?: () => void; }

export function VendorSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [vendorLogo, setVendorLogo] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);

  useEffect(() => {
    api.get('/vendors/me')
      .then(r => {
        setVendorLogo(r.data.data?.logo ?? null);
        setBusinessName(r.data.data?.businessName ?? null);
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
      <aside className={`v-side${isOpen ? ' is-open' : ''}`}>
      <div className="v-side-logo">
        <Link href="/" className="logo" style={{ padding: 0 }}>
          <Image src="/images/logo.png" alt="GoBuyMe" width={120} height={32} style={{ objectFit: 'contain', height: 32, width: 'auto' }} priority />
        </Link>
        <div className="muted" style={{ fontSize: 11, marginTop: 4, fontWeight: 600 }}>Vendor Portal</div>
      </div>

      {user && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="avatar" style={{ width: 40, height: 40, fontSize: 13, flexShrink: 0, border: '2px solid var(--line)' }}>
              {vendorLogo
                ? <img src={vendorLogo} alt={businessName ?? 'logo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials(businessName ?? user.name ?? 'V')
              }
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {businessName ?? user.name}
              </div>
              <div className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
        </div>
      )}

      <nav className="v-side-nav">
        <div className="v-nav-section">Main</div>
        {NAV.map(n => {
          const active = n.href === '/vendor' ? pathname === '/vendor' : pathname?.startsWith(n.href);
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
