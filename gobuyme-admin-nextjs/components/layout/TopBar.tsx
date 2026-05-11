'use client';
import { useTheme } from '@/context/ThemeContext';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Overview',
  '/vendors':   'Vendor Management',
  '/riders':    'Rider Management',
  '/orders':    'Order Management',
  '/customers': 'Customers',
  '/payouts':   'Payouts & Commissions',
  '/audit':     'Audit Logs',
  '/settings':  'Settings',
};

export function TopBar({ pathname }: { pathname: string }) {
  const { theme: T } = useTheme();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';
  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
        <div style={{ position: 'relative', cursor: 'pointer' }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div style={{
            position: 'absolute', top: -3, right: -3,
            width: 14, height: 14, borderRadius: 7,
            background: T.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>3</span>
          </div>
        </div>
        {/* Avatar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surface2, borderRadius: 4, padding: '6px 12px', cursor: 'pointer',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 13,
            background: 'linear-gradient(135deg,#FF521B,#CC3D0E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
          }}>👤</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Super Admin</span>
        </div>
      </div>
    </header>
  );
}
