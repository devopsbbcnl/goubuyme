'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

const NAV = [
  { href: '/dashboard',  label: 'Overview',   icon: '▦',  pendingKey: null as null | 'vendors' | 'riders' },
  { href: '/vendors',    label: 'Vendors',    icon: '🏪', pendingKey: 'vendors' as null | 'vendors' | 'riders' },
  { href: '/riders',     label: 'Riders',     icon: '🏍️', pendingKey: 'riders' as null | 'vendors' | 'riders' },
  { href: '/orders',     label: 'Orders',     icon: '📦', pendingKey: null as null | 'vendors' | 'riders' },
  { href: '/customers',  label: 'Customers',  icon: '👥', pendingKey: null as null | 'vendors' | 'riders' },
  { href: '/payouts',    label: 'Payouts',    icon: '💳', pendingKey: null as null | 'vendors' | 'riders' },
  { href: '/audit',      label: 'Audit Logs', icon: '📋', pendingKey: null as null | 'vendors' | 'riders' },
  { href: '/settings',   label: 'Settings',   icon: '⚙️', pendingKey: null as null | 'vendors' | 'riders' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme: T, isDark, toggleTheme } = useTheme();
  const [pending, setPending] = useState<{ vendors: number; riders: number }>({ vendors: 0, riders: 0 });

  useEffect(() => {
    Promise.allSettled([
      api.get<{ data: Array<{ approvalStatus: string }> }>('/admin/vendors?status=PENDING&limit=200'),
      api.get<{ data: Array<{ approvalStatus: string }> }>('/admin/riders?status=PENDING&limit=200'),
    ]).then(([vRes, rRes]) => {
      setPending({
        vendors: vRes.status === 'fulfilled'
          ? vRes.value.data.filter(v => v.approvalStatus === 'PENDING').length
          : 0,
        riders: rRes.status === 'fulfilled'
          ? rRes.value.data.filter(r => r.approvalStatus === 'PENDING').length
          : 0,
      });
    });
  }, []);

  return (
    <aside style={{
      width: 220, background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100vh', flexShrink: 0, position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #FF521B, #CC3D0E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🏍️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>GoBuyMe</div>
            <div style={{ fontSize: 10, color: T.textSec, fontWeight: 600 }}>Admin Console</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const badge = item.pendingKey ? pending[item.pendingKey] : 0;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 4, marginBottom: 2,
                background: isActive ? T.primaryTint : 'transparent',
                border: isActive ? `1px solid rgba(255,82,27,0.2)` : '1px solid transparent',
                cursor: 'pointer',
              }}>
                <span style={{ fontSize: 16, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
                <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? T.primary : T.textSec, flex: 1 }}>
                  {item.label}
                </span>
                {badge > 0 && (
                  <span style={{
                    background: T.warning, color: '#fff',
                    borderRadius: 999, padding: '1px 7px',
                    fontSize: 11, fontWeight: 700,
                  }}>{badge}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.border}` }}>
        <button onClick={toggleTheme} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: T.surface2, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: '9px 12px', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>
            {isDark ? 'Light mode' : 'Dark mode'}
          </span>
        </button>
      </div>

      {/* User */}
      <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 16,
          background: 'linear-gradient(135deg,#FF521B,#CC3D0E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>👤</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Super Admin</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>admin@gobuyme.shop</div>
        </div>
      </div>
    </aside>
  );
}
