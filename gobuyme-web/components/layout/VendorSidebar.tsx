'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api, { getActiveLocationId, setActiveLocationId } from '@/services/api';
import { DEFAULT_TERMINOLOGY, VendorTerminology } from '@/lib/vendorTerminology';

const NAV = [
  { href: '/vendor', icon: '📊', label: 'Dashboard' },
  { href: '/vendor/orders', icon: '📦', label: 'Orders' },
  { href: '/vendor/menu', icon: '🍽️', label: 'Menu' },
  { href: '/vendor/promotions', icon: '🎁', label: 'Promotions' },
  { href: '/vendor/earnings', icon: '💰', label: 'Earnings' },
  { href: '/vendor/documents', icon: '📄', label: 'Documents' },
  { href: '/vendor/profile', icon: '🏪', label: 'Store Profile' },
  { href: '/vendor/branches', icon: '📍', label: 'Locations' },
  { href: '/vendor/settings', icon: '⚙️', label: 'Settings' },
];

// Areas that belong to the business owner. A branch manager's login does not get them (the server
// refuses them too).
const OWNER_ONLY_HREFS = ['/vendor/documents', '/vendor/branches'];

interface SidebarProps { isOpen?: boolean; onClose?: () => void; }

export function VendorSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [vendorLogo, setVendorLogo] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [terms, setTerms] = useState<VendorTerminology>(DEFAULT_TERMINOLOGY);
  const [isManager, setIsManager] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; isMain: boolean }[]>([]);
  const [activeLocation, setActiveLocation] = useState<string>('main');

  // Every location this account owns, so the vendor can switch between them. Re-read whenever the
  // Locations page adds or removes a branch.
  const [locationsVersion, setLocationsVersion] = useState(0);
  useEffect(() => {
    const bump = () => setLocationsVersion(v => v + 1);
    window.addEventListener('gbm:locations-changed', bump);
    return () => window.removeEventListener('gbm:locations-changed', bump);
  }, []);
  useEffect(() => {
    api.get('/vendors/me/branches')
      .then(r => {
        const { main, branches } = r.data.data as { main: { id: string; businessName: string }; branches: { id: string; businessName: string }[] };
        const rows = [{ id: main.id, name: main.businessName, isMain: true }, ...branches.map(b => ({ id: b.id, name: b.businessName, isMain: false }))];
        setLocations(rows);
        const stored = getActiveLocationId();
        if (stored && !rows.some(l => l.id === stored)) setActiveLocationId(null); // that branch no longer exists
        else setActiveLocation(stored ?? 'main');
      })
      .catch(() => {});
  }, [locationsVersion]);

  const switchLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    setActiveLocation(loc?.isMain ? 'main' : id);
    setActiveLocationId(loc && !loc.isMain ? id : null);
  };

  useEffect(() => {
    api.get('/vendors/me')
      .then(r => {
        if (r.data.data?.terminology) setTerms(r.data.data.terminology);
        setIsManager(r.data.data?.accessLevel === 'BRANCH_MANAGER');
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

      {locations.length > 1 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <label htmlFor="location-switch" className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Managing</label>
          <select
            id="location-switch"
            className="input"
            style={{ marginTop: 6, fontSize: 13 }}
            value={activeLocation === 'main' ? (locations.find(l => l.isMain)?.id ?? '') : activeLocation}
            onChange={e => switchLocation(e.target.value)}
          >
            {locations.map(l => <option key={l.id} value={l.id}>{l.isMain ? `${l.name} (main)` : l.name}</option>)}
          </select>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Each location has its own menu, stock, hours and orders.</div>
        </div>
      )}

      <nav className="v-side-nav">
        <div className="v-nav-section">Main</div>
        {NAV.filter(n => !(isManager && OWNER_ONLY_HREFS.includes(n.href))).map(n => {
          const active = n.href === '/vendor' ? pathname === '/vendor' : pathname?.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`v-nav-item${active ? ' active' : ''}`} onClick={onClose}>
              <span>{n.icon}</span>
              <span>{n.href === '/vendor/menu' ? terms.section : n.label}</span>
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
