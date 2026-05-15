'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Overview',
  '/vendors':   'Vendor Management',
  '/riders':    'Rider Management',
  '/orders':    'Order Management',
  '/customers': 'Customers',
  '/payouts':   'Payouts & Commissions',
  '/audit':     'Audit Logs',
  '/admins':    'Admin Users',
  '/settings':  'Settings',
};

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN:       '#FF521B',
  OPERATIONS_ADMIN:  '#3B82F6',
  SUPPORT_ADMIN:     '#10B981',
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN:       'Super Admin',
  OPERATIONS_ADMIN:  'Operations',
  SUPPORT_ADMIN:     'Support',
};

type VendorItem = { id: string; businessName: string; city: string; createdAt: string };
type RiderItem  = { id: string; name: string; vehicleType: string; createdAt: string };
type OrderItem = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  vendorName?: string;
  vendor?: { businessName?: string };
};

const ORDER_COLOR: Record<string, string> = {
  PENDING: '#F59E0B', CONFIRMED: '#3B82F6', PREPARING: '#8B5CF6',
  READY: '#06B6D4', DELIVERING: '#FF521B', DELIVERED: '#10B981', CANCELLED: '#EF4444',
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TopBar({ pathname }: { pathname: string }) {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';
  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const [open, setOpen] = useState(false);
  const [pendingVendors, setPendingVendors] = useState<VendorItem[]>([]);
  const [pendingRiders, setPendingRiders]   = useState<RiderItem[]>([]);
  const [recentOrders, setRecentOrders]     = useState<OrderItem[]>([]);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get<{ data: VendorItem[] }>('/admin/vendors?status=PENDING&limit=5'),
      api.get<{ data: RiderItem[]  }>('/admin/riders?status=PENDING&limit=5'),
      api.get<{ data: OrderItem[]  }>('/admin/orders?limit=5'),
    ]).then(([vRes, rRes, oRes]) => {
      if (vRes.status === 'fulfilled') setPendingVendors(vRes.value.data ?? []);
      if (rRes.status === 'fulfilled') setPendingRiders(rRes.value.data ?? []);
      if (oRes.status === 'fulfilled') setRecentOrders(oRes.value.data ?? []);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const totalBadge   = pendingVendors.length + pendingRiders.length;
  const hasApprovals = pendingVendors.length > 0 || pendingRiders.length > 0;
  const hasOrders    = recentOrders.length > 0;
  const isEmpty      = !hasApprovals && !hasOrders;

  return (
    <header style={{
      height: 58, background: T.surface,
      borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px', flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{title}</div>
        <div style={{ fontSize: 11, color: T.textSec }}>{today}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Bell */}
        <div ref={dropRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: 4, lineHeight: 1, display: 'flex' }}
          >
            <span style={{ fontSize: 18 }}>🔔</span>
            {totalBadge > 0 && (
              <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 14, height: 14, borderRadius: 7,
                background: T.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>
                  {totalBadge > 99 ? '99+' : totalBadge}
                </span>
              </div>
            )}
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              width: 340, background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 200, overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Notifications</span>
                {totalBadge > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.primary }}>
                    {totalBadge} pending
                  </span>
                )}
              </div>

              {isEmpty ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 13, color: T.textSec }}>All caught up!</div>
                </div>
              ) : (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>

                  {hasApprovals && (
                    <>
                      <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: T.textSec, letterSpacing: '0.5px' }}>
                        AWAITING APPROVAL
                      </div>
                      {pendingVendors.map(v => (
                        <Link key={v.id} href="/vendors" style={{ textDecoration: 'none' }} onClick={() => setOpen(false)}>
                          <NotifRow
                            icon="🏪" title={v.businessName}
                            sub={`New vendor · ${v.city} · ${timeAgo(v.createdAt)}`}
                            dot T={T}
                          />
                        </Link>
                      ))}
                      {pendingRiders.map(r => (
                        <Link key={r.id} href="/riders" style={{ textDecoration: 'none' }} onClick={() => setOpen(false)}>
                          <NotifRow
                            icon="🏍️" title={r.name}
                            sub={`New rider · ${r.vehicleType} · ${timeAgo(r.createdAt)}`}
                            dot T={T}
                          />
                        </Link>
                      ))}
                    </>
                  )}

                  {hasOrders && (
                    <>
                      <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: T.textSec, letterSpacing: '0.5px' }}>
                        RECENT ORDERS
                      </div>
                      {recentOrders.map(o => {
                        const col = ORDER_COLOR[o.status] ?? '#888';
                        const vendorName = o.vendorName ?? o.vendor?.businessName ?? 'Unknown vendor';
                        return (
                          <Link key={o.id} href="/orders" style={{ textDecoration: 'none' }} onClick={() => setOpen(false)}>
                            <NotifRow
                              icon="📦"
                              iconBg={`${col}18`}
                              title={`#${o.orderNumber}`}
                              titleExtra={
                                <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}18`, padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>
                                  {o.status}
                                </span>
                              }
                              sub={`${vendorName} · ₦${o.totalAmount.toLocaleString()} · ${timeAgo(o.createdAt)}`}
                              T={T}
                            />
                          </Link>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {!isEmpty && (
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 16 }}>
                  {hasApprovals && (
                    <Link href="/vendors" style={{ textDecoration: 'none', fontSize: 12, fontWeight: 600, color: T.primary }} onClick={() => setOpen(false)}>
                      Review approvals →
                    </Link>
                  )}
                  {hasOrders && (
                    <Link href="/orders" style={{ textDecoration: 'none', fontSize: 12, fontWeight: 600, color: T.textSec }} onClick={() => setOpen(false)}>
                      All orders →
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Admin badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 12px',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 13,
            background: `linear-gradient(135deg,${ROLE_COLOR[user?.role ?? ''] ?? '#FF521B'},${ROLE_COLOR[user?.role ?? ''] ?? '#CC3D0E'}cc)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
          }}>👤</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{user?.name ?? 'Admin'}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: ROLE_COLOR[user?.role ?? ''] ?? '#FF521B', lineHeight: 1.2 }}>
              {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function NotifRow({ icon, iconBg, title, titleExtra, sub, dot, T }: {
  icon: string; iconBg?: string; title: string;
  titleExtra?: React.ReactNode; sub: string; dot?: boolean;
  T: Record<string, string>;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: '10px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: hovered ? T.surface2 : 'transparent' }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 6, background: iconBg ?? 'rgba(255,82,27,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{titleExtra}
        </div>
        <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>{sub}</div>
      </div>
      {dot && <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.primary, flexShrink: 0, marginTop: 5 }} />}
    </div>
  );
}
