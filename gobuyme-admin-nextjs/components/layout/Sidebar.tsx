'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useIsMobile } from '@/hooks/useIsMobile';


type NavItem = {
  href: string;
  label: string;
  icon: string;
  pendingKey: null | 'vendors' | 'riders' | 'errorLogs';
  minRole?: 'OPERATIONS_ADMIN' | 'SUPER_ADMIN';
};

const NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Overview',     icon: '▦',  pendingKey: null },
  { href: '/analytics',  label: 'Analytics',     icon: '📈', pendingKey: null },
  { href: '/vendors',    label: 'Vendors',       icon: '🏪', pendingKey: 'vendors' },
  { href: '/riders',     label: 'Riders',        icon: '🏍️', pendingKey: 'riders' },
  { href: '/orders',     label: 'Orders',        icon: '📦', pendingKey: null },
  { href: '/customers',  label: 'Customers',     icon: '👥', pendingKey: null },
  { href: '/pricing',    label: 'Pricing',       icon: '💰', pendingKey: null, minRole: 'OPERATIONS_ADMIN' },
  { href: '/payouts',    label: 'Payouts',       icon: '💳', pendingKey: null, minRole: 'OPERATIONS_ADMIN' },
  { href: '/error-logs', label: 'Error Logs',    icon: '🐞', pendingKey: 'errorLogs' },
  { href: '/audit',      label: 'Audit Logs',    icon: '📋', pendingKey: null },
  { href: '/server-logs', label: 'Server Logs',  icon: '📜', pendingKey: null, minRole: 'SUPER_ADMIN' },
  { href: '/admins',     label: 'Admin Users',   icon: '🔐', pendingKey: null, minRole: 'SUPER_ADMIN' },
  { href: '/settings',   label: 'Settings',      icon: '⚙️', pendingKey: null },
];

const ROLE_RANK: Record<string, number> = {
  SUPPORT_ADMIN: 0,
  OPERATIONS_ADMIN: 1,
  SUPER_ADMIN: 2,
};

function canSeeItem(userRole: string, minRole?: string) {
  if (!minRole) return true;
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

export function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { theme: T, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [pending, setPending] = useState<{ vendors: number; riders: number; errorLogs: number }>({ vendors: 0, riders: 0, errorLogs: 0 });

  useEffect(() => {
    Promise.allSettled([
      api.get<{ data: Array<{ approvalStatus: string }> }>('/admin/vendors?status=PENDING&limit=200'),
      api.get<{ data: Array<{ approvalStatus: string }> }>('/admin/riders?status=PENDING&limit=200'),
      api.get<{ pagination: { total: number } }>('/admin/error-logs?resolved=false&limit=1'),
    ]).then(([vRes, rRes, eRes]) => {
      setPending({
        vendors: vRes.status === 'fulfilled'
          ? vRes.value.data.filter(v => v.approvalStatus === 'PENDING').length
          : 0,
        riders: rRes.status === 'fulfilled'
          ? rRes.value.data.filter(r => r.approvalStatus === 'PENDING').length
          : 0,
        errorLogs: eRes.status === 'fulfilled' ? eRes.value.pagination.total : 0,
      });
    });
  }, []);

  const userRole = user?.role ?? 'SUPPORT_ADMIN';

  return (
    <>
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 90,
          }}
        />
      )}
      <aside style={{
        width: 220, background: T.surface,
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        height: '100dvh', flexShrink: 0,
        ...(isMobile
          ? {
              position: 'fixed', top: 0, left: 0, zIndex: 100,
              transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 220ms ease',
              boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.25)' : 'none',
            }
          : { position: 'sticky', top: 0 }),
      }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/icon.png" alt="GoBuyMe" width={34} height={34} style={{ borderRadius: 9 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>GoBuyMe</div>
            <div style={{ fontSize: 10, color: T.textSec, fontWeight: 600 }}>Admin Console</div>
          </div>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
              fontSize: 16, color: T.textSec, cursor: 'pointer', flexShrink: 0,
            }}
          >✕</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV.filter(item => canSeeItem(userRole, item.minRole)).map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const badge = item.pendingKey ? pending[item.pendingKey] : 0;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }} onClick={() => { if (isMobile) onClose?.(); }}>
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

      {/* Sign out */}
      <div style={{ padding: '10px 12px 14px', borderTop: `1px solid ${T.border}` }}>
        <button onClick={logout} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: `1px solid ${T.border}`,
          borderRadius: 4, padding: '8px 12px', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 14 }}>↩</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>Sign out</span>
        </button>
      </div>
      </aside>
    </>
  );
}
