'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';

interface FleetRider {
  id: string; name: string; email: string; phone: string | null;
  vehicleType: string; plateNumber: string | null; isOnline: boolean;
  rating: number; deliveries: number;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}
interface FleetInvite { id: string; email: string; expiresAt: string; expired: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const apiMessage = (e: any, fallback: string) => e?.response?.data?.message ?? fallback;

export default function CompanyFleetPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [riders, setRiders] = useState<FleetRider[]>([]);
  const [invites, setInvites] = useState<FleetInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/company/me/fleet');
      setRiders(data.data.riders);
      setInvites(data.data.invites);
    } catch { /* keep what we have */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) { setError('Enter a valid email address.'); return; }
    setError(''); setInviting(true);
    try {
      await api.post('/company/me/fleet/invites', { email: value });
      setEmail('');
      toast(`Invite sent to ${value}.`, 'success');
      await load();
    } catch (err) {
      setError(apiMessage(err, 'Could not send the invite. Please try again.'));
    } finally { setInviting(false); }
  };

  const revoke = async (i: FleetInvite) => {
    if (!(await confirmDialog(`Cancel the invite to ${i.email}?`, { confirmLabel: 'Cancel invite', danger: true }))) return;
    try { await api.delete(`/company/me/fleet/invites/${i.id}`); await load(); }
    catch (err) { toast(apiMessage(err, 'Could not cancel the invite.'), 'error'); }
  };

  const removeRider = async (r: FleetRider) => {
    const ok = await confirmDialog(
      `Remove ${r.name} from your fleet? If joining your fleet was how they were approved, they will need to be approved again.`,
      { confirmLabel: 'Remove', danger: true },
    );
    if (!ok) return;
    try { await api.delete(`/company/me/fleet/riders/${r.id}`); await load(); }
    catch (err) { toast(apiMessage(err, 'Could not remove the rider.'), 'error'); }
  };

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 6 }}>Your fleet</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
        Invite riders by email. They join automatically when they sign up or sign in as a rider with that address.
      </p>

      <form onSubmit={invite} className="card card-pad" style={{ marginBottom: 28, maxWidth: 520 }}>
        <div className="form-group">
          <label className="label" htmlFor="invite-email">Rider email</label>
          <input id="invite-email" className="input" type="email" value={email} placeholder="rider@example.com"
            onChange={e => { setEmail(e.target.value); setError(''); }} />
        </div>
        {error && <div className="input-error" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="btn btn-primary" disabled={inviting}>{inviting ? 'Sending…' : 'Send invite'}</button>
      </form>

      {loading ? <div className="sk" style={{ height: 120 }} /> : (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Riders ({riders.length})</h2>
          {riders.length === 0 && <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>No riders yet. Invited riders show up here once they join.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {riders.map(r => (
              <div key={r.id} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
                <span title={r.isOnline ? 'Online' : 'Offline'} style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: r.isOnline ? 'var(--success)' : 'var(--muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.vehicleType}{r.plateNumber ? ` · ${r.plateNumber}` : ''} · {r.deliveries} deliveries · {r.email}
                  </div>
                  {r.approvalStatus !== 'APPROVED' && (
                    <span className="badge badge-warning" style={{ marginTop: 6 }}>
                      {r.approvalStatus === 'PENDING' ? 'Waiting for approval' : r.approvalStatus.toLowerCase()}
                    </span>
                  )}
                </div>
                <button className="btn btn-ghost" onClick={() => removeRider(r)}>Remove</button>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Open invites ({invites.length})</h2>
          {invites.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No open invites.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invites.map(i => (
              <div key={i.id} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{i.email}</div>
                  <div style={{ fontSize: 12, color: i.expired ? 'var(--error)' : 'var(--muted)' }}>
                    {i.expired ? 'Expired. Send a new invite to reopen it.' : `Expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => revoke(i)}>Cancel</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
