'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

type Theme = Record<string, string>;

export interface OrderEvent {
  id: string;
  type: 'STATUS_CHANGED' | 'RIDER_ASSIGNED' | 'RIDER_UNASSIGNED' | 'CREDIT_ISSUED';
  fromStatus: string | null;
  toStatus: string | null;
  actorType: 'CUSTOMER' | 'VENDOR' | 'RIDER' | 'ADMIN' | 'SYSTEM' | 'AGENT';
  actorId: string | null;
  actorName: string | null;
  note: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface ActionableOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  rider: { id: string; user: { name: string } } | null;
}

interface CandidateRider {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string;
  isAvailable: boolean;
  rating: number;
  distanceKm: number | null;
}

type Mode = null | 'cancel' | 'assign' | 'unassign' | 'credit';

const CANCELLABLE = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'IN_TRANSIT'];
const naira = (n: number) => `₦${n.toLocaleString()}`;
const labelize = (s: string) => s.split('_').map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');

/** Admin write actions for one order: cancel, (re)assign rider, remove rider, goodwill credit. */
export function OrderActionsPanel({ order, isSuperAdmin, T, onChanged }: {
  order: ActionableOrder;
  isSuperAdmin: boolean;
  T: Theme;
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [riders, setRiders] = useState<CandidateRider[] | null>(null);
  const [riderId, setRiderId] = useState<string | null>(null);

  const isReady = order.status === 'READY';
  const canCancel = CANCELLABLE.includes(order.status);
  const isPaid = order.paymentStatus === 'PAID';

  // The parent remounts this panel (via `key`) when the order or its status changes, so state
  // only needs resetting when switching between actions here.
  const toggleMode = (m: Mode) => {
    const next = mode === m ? null : m;
    setMode(next);
    setError(null);
    setReason('');
    setAmount('');
    setRiderId(null);
    if (next !== 'assign') return;
    setRiders(null);
    api.get<{ data: CandidateRider[] }>(`/admin/orders/${order.id}/candidate-riders`)
      .then(res => setRiders(res.data))
      .catch(e => { setRiders([]); setError(e instanceof Error ? e.message : 'Failed to load riders.'); });
  };

  const run = async (path: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>(`/admin/orders/${order.id}/${path}`, body);
      setMode(null);
      onChanged(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const btn = (label: string, m: Mode, color = T.text) => (
    <button
      key={label}
      onClick={() => toggleMode(m)}
      style={{
        padding: '7px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${mode === m ? T.primary : color === T.text ? T.border : color}`,
        background: mode === m ? T.primaryTint : 'none',
        color: mode === m ? T.primary : color,
      }}
    >
      {label}
    </button>
  );

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };
  const primaryBtn = (label: string, onClick: () => void, disabled: boolean, danger = false) => (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        padding: '8px 16px', borderRadius: 4, border: 'none', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        background: danger ? T.error : T.primary, color: '#fff',
        cursor: disabled || busy ? 'not-allowed' : 'pointer', opacity: disabled || busy ? 0.5 : 1,
      }}
    >
      {busy ? 'Working…' : label}
    </button>
  );

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>
          Actions
        </span>
        {isReady && btn(order.rider ? 'Reassign rider' : 'Assign rider', 'assign')}
        {isReady && order.rider && btn('Remove rider', 'unassign')}
        {btn('Issue credit', 'credit')}
        {canCancel && btn('Cancel order', 'cancel', T.error)}
      </div>

      {mode === 'cancel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5 }}>
            {isPaid
              ? <>The customer will get <b style={{ color: T.text }}>{naira(order.totalAmount)}</b> back as GoBuyMe store credit (not to their card).</>
              : 'The order is unpaid, so no refund is issued.'}
            {' '}Reserved stock is restored{order.rider ? ', the rider is released' : ''} and the customer and vendor are notified.
            {['PICKED_UP', 'IN_TRANSIT'].includes(order.status) && (
              <div style={{ color: T.warning, marginTop: 6 }}>The rider has already picked this order up and won&apos;t be paid for it.</div>
            )}
          </div>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={500}
            placeholder="Reason (shown in the audit log and order timeline)" style={{ ...field, resize: 'vertical' }} />
          <div>{primaryBtn(`Cancel ${order.orderNumber}`, () => run('cancel', { reason }), reason.trim().length < 5, true)}</div>
        </div>
      )}

      {mode === 'assign' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {riders === null ? (
            <div style={{ fontSize: 13, color: T.textSec }}>Finding online riders…</div>
          ) : riders.length === 0 ? (
            <div style={{ fontSize: 13, color: T.textSec }}>No approved riders are online without an active delivery right now.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {riders.map(r => (
                <label key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${riderId === r.id ? T.primary : T.border}`, background: riderId === r.id ? T.primaryTint : 'none',
                }}>
                  <input type="radio" name="rider" checked={riderId === r.id} onChange={() => setRiderId(r.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: T.textSec }}>
                      {r.vehicleType} · {r.phone ?? 'no phone'}{r.rating > 0 ? ` · ★ ${r.rating.toFixed(1)}` : ''}{!r.isAvailable ? ' · marked unavailable' : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec, whiteSpace: 'nowrap' }}>
                    {r.distanceKm == null ? 'location unknown' : `${r.distanceKm} km from vendor`}
                  </div>
                </label>
              ))}
            </div>
          )}
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
            placeholder="Note (optional)" style={field} />
          <div>{primaryBtn(order.rider ? 'Reassign' : 'Assign', () => run('assign-rider', { riderId, note: reason }), !riderId)}</div>
        </div>
      )}

      {mode === 'unassign' && order.rider && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {order.rider.user.name} will be notified and the order goes back into the open jobs list for any rider to accept.
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
            placeholder="Note (optional)" style={field} />
          <div>{primaryBtn('Remove rider', () => run('unassign-rider', { note: reason }), false)}</div>
        </div>
      )}

      {mode === 'credit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: T.textSec }}>
            Goodwill store credit to the customer, usable on their next order.{' '}
            {isSuperAdmin ? 'Super admins can issue up to the order total.' : 'Operations admins can issue up to ₦2,000 per order.'}
          </div>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal"
            placeholder="Amount (₦)" style={{ ...field, maxWidth: 200 }} />
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={500}
            placeholder="Why? (e.g. delivery arrived 40 min late)" style={{ ...field, resize: 'vertical' }} />
          <div>{primaryBtn('Issue credit', () => run('credit', { amount: Number(amount), note: reason }),
            !(Number(amount) > 0) || reason.trim().length < 5)}</div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: T.error, background: T.errorBg, borderRadius: 4, padding: '8px 12px' }}>{error}</div>
      )}
    </div>
  );
}

const ACTOR_LABEL: Record<OrderEvent['actorType'], string> = {
  CUSTOMER: 'Customer', VENDOR: 'Vendor', RIDER: 'Rider', ADMIN: 'Admin', SYSTEM: 'System', AGENT: 'Agent',
};

function describeEvent(e: OrderEvent): string {
  const meta = e.meta ?? {};
  switch (e.type) {
    case 'STATUS_CHANGED':
      return e.fromStatus ? `${labelize(e.fromStatus)} → ${labelize(e.toStatus ?? '')}` : `Created as ${labelize(e.toStatus ?? '')}`;
    case 'RIDER_ASSIGNED':
      if (meta.selfAccepted) return 'Rider accepted the job';
      return meta.previousRiderId ? `Reassigned to ${meta.riderName ?? 'rider'}` : `Assigned to ${meta.riderName ?? 'rider'}`;
    case 'RIDER_UNASSIGNED':
      return 'Rider removed';
    case 'CREDIT_ISSUED':
      return `${naira(Number(meta.amount ?? 0))} goodwill credit`;
  }
}

export function OrderTimeline({ events, T }: { events: OrderEvent[]; T: Theme }) {
  if (events.length === 0) {
    return <p style={{ fontSize: 13, color: T.textSec, margin: 0 }}>No timeline recorded. This order predates order events.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: 9999, marginTop: 5, background: e.toStatus === 'CANCELLED' ? T.error : T.primary }} />
            {i < events.length - 1 && <div style={{ flex: 1, width: 1, background: T.border }} />}
          </div>
          <div style={{ paddingBottom: 12, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{describeEvent(e)}</div>
            <div style={{ fontSize: 12, color: T.textSec }}>
              {new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {' · '}{e.actorName ?? ACTOR_LABEL[e.actorType]}
              {e.actorName && ` (${ACTOR_LABEL[e.actorType].toLowerCase()})`}
            </div>
            {e.note && <div style={{ fontSize: 12, color: T.textSec, marginTop: 2, wordBreak: 'break-word' }}>“{e.note}”</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
