'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { resolveVendorRoute } from '@/services/vendorGate';

type RoleKey = 'customer' | 'vendor' | 'rider';
type RoleRow = { role: RoleKey; status: string; canSwitch: boolean };

const META: Record<RoleKey, { icon: string; title: string; sub: string; join: string; home: string }> = {
  customer: { icon: '🛍️', title: 'Customer', sub: 'Shop, order and track deliveries', join: '', home: '/home' },
  vendor:   { icon: '🏪', title: 'Vendor',   sub: 'Manage your business and orders', join: 'Register your business', home: '/vendor' },
  rider:    { icon: '🏍️', title: 'Rider',    sub: 'Accept deliveries and earn', join: 'Become a delivery partner', home: '/rider' },
};

const statusText = (r: RoleRow, current: boolean): string => {
  if (current) return 'Current';
  switch (r.status) {
    case 'NOT_REGISTERED': return 'Not registered';
    case 'PENDING': return 'Pending approval';
    case 'APPROVED': return 'Approved';
    case 'REJECTED': return 'Not approved';
    case 'SUSPENDED': return 'Suspended';
    default: return r.status;
  }
};

export default function RoleSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, switchRole } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<RoleRow[] | null>(null);
  const [busy, setBusy] = useState<RoleKey | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError('');
    api.get('/auth/roles')
      .then(res => {
        const list = (res.data.data.roles as { role: string; status: string; canSwitch: boolean }[])
          .map(r => ({ ...r, role: r.role.toLowerCase() as RoleKey }))
          .filter(r => r.role in META);
        setRows(list);
      })
      .catch(() => setError('Could not load your roles. Check your connection and try again.'));
  }, [open]);

  if (!open) return null;

  const close = () => { if (!busy) onClose(); };

  const choose = async (r: RoleRow) => {
    setError('');
    if (r.role === user?.role) { onClose(); return; }
    if (r.status === 'NOT_REGISTERED') {
      onClose();
      router.push(`/become-role?role=${r.role}`);
      return;
    }
    if (!r.canSwitch) {
      setError(r.status === 'SUSPENDED'
        ? 'This role is suspended. Contact support for help.'
        : 'This role was not approved. Contact support for help.');
      return;
    }

    setBusy(r.role);
    try {
      await switchRole(r.role);
      onClose();
      // An unfinished store profile goes to setup first, same as at sign-in.
      router.replace(r.role === 'vendor' ? await resolveVendorRoute() : META[r.role].home);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Could not switch. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>Switch experience</h3>
          <button onClick={close} className="icon-btn" style={{ color: 'var(--muted)' }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>{user?.email}</p>

          {!rows && !error && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}

          {rows?.map(r => {
            const m = META[r.role];
            const current = r.role === user?.role;
            return (
              <button
                key={r.role}
                disabled={busy !== null}
                onClick={() => choose(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: 14, marginBottom: 10, borderRadius: 4, cursor: 'pointer',
                  background: current ? 'var(--primary-tint, rgba(255,82,27,.08))' : 'var(--surface)',
                  border: `1px solid ${current ? 'var(--primary)' : 'var(--border)'}`,
                  color: 'var(--text)',
                }}
              >
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{m.title}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                    {r.status === 'NOT_REGISTERED' ? m.join : m.sub}
                  </span>
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: current ? 'var(--primary)' : 'var(--muted)' }}>
                  {busy === r.role ? 'Switching…' : statusText(r, current)}
                </span>
              </button>
            );
          })}

          {!!error && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 4 }}>{error}</p>}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
