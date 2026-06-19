'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

// Shape returned by the list endpoint
interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  paymentMethod: string;
  paymentStatus: string;
  customer: string;
  customerPhone: string;
  items: string[];           // e.g. ["Jollof Rice x2", "Chicken x1"]
  note?: string;
  createdAt: string;
}

// Extra fields returned by the detail endpoint (optional enrichment)
interface OrderDetail extends OrderSummary {
  deliveryAddress?: string;
  cancelReason?: string;
  items: string[] | { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUSES = ['', 'PENDING', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'];

const BADGE: Record<string, string> = {
  PENDING:   'badge-warning',
  CONFIRMED: 'badge-info',
  PREPARING: 'badge-info',
  READY:     'badge-success',
  DELIVERED: 'badge-success',
  CANCELLED: 'badge-error',
};

const PS_BADGE: Record<string, string> = {
  PAID: 'badge-success', PENDING: 'badge-warning', FAILED: 'badge-error', REFUNDED: 'badge-neutral',
};

const PM_LABEL: Record<string, string> = {
  CARD: 'Card', TRANSFER: 'Transfer', WALLET: 'Wallet', CASH: 'Cash on Delivery',
};

// action that the API accepts for each current status
const ADVANCE_ACTION: Record<string, string> = {
  PENDING:   'accept',
  CONFIRMED: 'accept',
  PREPARING: 'ready',
};
const ADVANCE_LABEL: Record<string, string> = {
  PENDING:   'Accept Order',
  CONFIRMED: 'Accept Order',
  PREPARING: 'Mark Ready',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isRichItems(items: OrderDetail['items']): items is { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[] {
  return items.length > 0 && typeof items[0] === 'object';
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VendorOrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  // modal state
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [enriching, setEnriching] = useState(false);   // background detail fetch
  const [cancelReason, setCancelReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : '';
    api.get(`/vendors/me/orders${qs}`)
      .then(r => setOrders(r.data.data ?? []))
      .catch(() => toast('Could not load orders', 'error'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Open the modal immediately from list data, then enrich silently
  const openDetail = (order: OrderSummary) => {
    setSelected(order as OrderDetail);
    setShowRejectInput(false);
    setCancelReason('');

    setEnriching(true);
    api.get(`/vendors/me/orders/${order.id}`)
      .then(r => {
        if (r.data.data) setSelected(r.data.data as OrderDetail);
      })
      .catch(() => { /* silently ignore — modal already open with list data */ })
      .finally(() => setEnriching(false));
  };

  const closeDetail = () => {
    setSelected(null);
    setShowRejectInput(false);
    setCancelReason('');
  };

  const doAction = async (orderId: string, action: string, reason?: string) => {
    setUpdating(orderId);
    try {
      await api.patch(`/vendors/me/orders/${orderId}/status`, {
        action,
        ...(reason ? { reason } : {}),
      });
      const nextStatus =
        action === 'accept' ? 'PREPARING' :
        action === 'ready'  ? 'READY'     :
        'CANCELLED';
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
      setSelected(prev => prev ? { ...prev, status: nextStatus, ...(reason ? { cancelReason: reason } : {}) } : null);
      toast(action === 'reject' ? 'Order cancelled' : 'Order updated', action === 'reject' ? 'info' : 'success');
      setShowRejectInput(false);
      setCancelReason('');
    } catch (err: any) {
      toast(err?.response?.data?.message ?? 'Update failed', 'error');
    } finally {
      setUpdating(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="between" style={{ marginBottom: 24 }}>
        <h1 className="t-page">Orders</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* status filter chips */}
      <div className="chip-row" style={{ marginBottom: 24 }}>
        {STATUSES.map(s => (
          <button key={s} className={`chip${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 100 }} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="empty">
          <div className="emoji">📦</div>
          <h3>No orders</h3>
          <p>Orders matching your filter will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(o => (
            <div
              key={o.id}
              className="card card-pad"
              style={{ cursor: 'pointer' }}
              onClick={() => openDetail(o)}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
            >
              {/* header */}
              <div className="between" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>#{o.orderNumber}</span>
                  <span className={`badge ${BADGE[o.status] ?? 'badge-neutral'}`}>{o.status}</span>
                  <span className={`badge ${PS_BADGE[o.paymentStatus] ?? 'badge-neutral'}`} style={{ fontSize: 11 }}>{o.paymentStatus}</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--brand)' }}>
                  ₦{(o.subtotal ?? 0).toLocaleString()}
                </span>
              </div>

              {/* customer + time */}
              <div className="between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  👤 {o.customer} · {o.customerPhone}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{fmt(o.createdAt)}</span>
              </div>

              {/* items summary */}
              <div className="muted" style={{ fontSize: 12, marginBottom: ADVANCE_ACTION[o.status] ? 12 : 0 }}>
                {Array.isArray(o.items) ? o.items.join(' · ') : ''}
              </div>

              {/* quick-action buttons — stop propagation so they don't open modal */}
              {(ADVANCE_ACTION[o.status] || o.status === 'PENDING' || o.status === 'CONFIRMED') && (
                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                  {ADVANCE_ACTION[o.status] && (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={updating === o.id}
                      onClick={() => doAction(o.id, ADVANCE_ACTION[o.status])}
                    >
                      {updating === o.id ? <span className="spin" /> : ADVANCE_LABEL[o.status]}
                    </button>
                  )}
                  {(o.status === 'PENDING' || o.status === 'CONFIRMED') && (
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={updating === o.id}
                      onClick={() => { if (confirm('Cancel this order?')) doAction(o.id, 'reject'); }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Order Detail Modal ── */}
      {selected && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>

            {/* header */}
            <div className="modal-head">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800 }}>#{selected.orderNumber}</h3>
                  {enriching && <span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--brand)', width: 14, height: 14 }} />}
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{fmt(selected.createdAt)}</p>
              </div>
              <button onClick={closeDetail} style={{ fontSize: 18, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* badges */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${BADGE[selected.status] ?? 'badge-neutral'}`}>{selected.status}</span>
                <span className={`badge ${PS_BADGE[selected.paymentStatus] ?? 'badge-neutral'}`}>{selected.paymentStatus}</span>
                <span className="badge badge-neutral">{PM_LABEL[selected.paymentMethod] ?? selected.paymentMethod}</span>
              </div>

              {/* customer */}
              <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--muted)', marginBottom: 6 }}>Customer</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.customer}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{selected.customerPhone}</div>
                {(selected as OrderDetail).deliveryAddress && (
                  <div style={{ fontSize: 13, marginTop: 6 }}>📍 {(selected as OrderDetail).deliveryAddress}</div>
                )}
              </div>

              {/* items */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--muted)', marginBottom: 8 }}>Items</div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                  {isRichItems(selected.items) ? (
                    // enriched view: individual item prices
                    (selected.items as any[]).map((item, i) => (
                      <div key={item.id ?? i} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</span>
                          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>₦{item.unitPrice.toLocaleString()} each</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <span className="muted" style={{ fontSize: 13 }}>×{item.quantity}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 70, textAlign: 'right' }}>₦{item.lineTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    // list-data view: string descriptions
                    (selected.items as string[]).map((line, i) => (
                      <div key={i} style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--line)', fontSize: 14, fontWeight: 600 }}>
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* order total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--surface2)', borderRadius: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Order Total</span>
                <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--brand)' }}>₦{selected.subtotal.toLocaleString()}</span>
              </div>

              {/* note */}
              {selected.note && (
                <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>Note: </span>{selected.note}
                </div>
              )}

              {/* cancel reason */}
              {(selected as OrderDetail).cancelReason && (
                <div style={{ padding: '10px 14px', background: '#FEE', borderRadius: 4, fontSize: 13, color: 'var(--error)', fontWeight: 600 }}>
                  Cancel reason: {(selected as OrderDetail).cancelReason}
                </div>
              )}

              {/* reject reason input */}
              {showRejectInput && (
                <div>
                  <label className="label">Cancel reason (optional)</label>
                  <input
                    className="input"
                    placeholder="e.g. Out of stock"
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* footer actions */}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={closeDetail}>Close</button>

              {(selected.status === 'PENDING' || selected.status === 'CONFIRMED') && !showRejectInput && (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={updating === selected.id}
                  onClick={() => setShowRejectInput(true)}
                >
                  Cancel Order
                </button>
              )}

              {showRejectInput && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowRejectInput(false); setCancelReason(''); }}>
                    Back
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={updating === selected.id}
                    onClick={() => doAction(selected.id, 'reject', cancelReason || undefined)}
                  >
                    {updating === selected.id ? <span className="spin" /> : 'Confirm Cancel'}
                  </button>
                </>
              )}

              {ADVANCE_ACTION[selected.status] && !showRejectInput && (
                <button
                  className="btn btn-primary"
                  disabled={updating === selected.id}
                  onClick={() => doAction(selected.id, ADVANCE_ACTION[selected.status])}
                >
                  {updating === selected.id ? <span className="spin" /> : ADVANCE_LABEL[selected.status]}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
