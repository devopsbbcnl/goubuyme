'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/services/api';

interface Delivery {
  id: string; orderNumber: string; status: string; deliveryFee: number;
  deliveryAddress: string; vendorName: string; riderName: string | null; createdAt: string;
}

const PAGE_SIZE = 20;
const STATUS_LABEL: Record<string, string> = {
  READY: 'Ready for pickup', PICKED_UP: 'On the way', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

export default function CompanyDeliveriesPage() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (p: number) => {
    const { data } = await api.get('/company/me/deliveries', { params: { page: p, limit: PAGE_SIZE } });
    return data.data as { deliveries: Delivery[]; total: number };
  }, []);

  useEffect(() => {
    fetchPage(1)
      .then(d => { setItems(d.deliveries); setTotal(d.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const d = await fetchPage(page + 1);
      setItems(prev => [...prev, ...d.deliveries]);
      setPage(p => p + 1);
    } catch { /* try again on next click */ }
    finally { setLoadingMore(false); }
  };

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 6 }}>Fleet deliveries</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>Orders delivered by your riders, newest first.</p>

      {loading ? <div className="sk" style={{ height: 120 }} /> : items.length === 0 ? (
        <div className="empty">
          <div className="emoji">📦</div>
          <h3>No deliveries yet</h3>
          <p>They show up here once your riders take jobs.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(d => (
              <div key={d.id} className="card card-pad" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>#{d.orderNumber}</strong>
                  <span className={`badge ${d.status === 'DELIVERED' ? 'badge-success' : 'badge-neutral'}`}>
                    {STATUS_LABEL[d.status] ?? d.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 13, margin: '6px 0' }}>{d.vendorName} → {d.deliveryAddress}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted">
                  <span>{d.riderName ?? 'Unassigned'} · {new Date(d.createdAt).toLocaleDateString()}</span>
                  <strong style={{ color: 'var(--text)' }}>₦{d.deliveryFee.toLocaleString()}</strong>
                </div>
              </div>
            ))}
          </div>
          {items.length < total && (
            <button className="btn btn-ghost" onClick={loadMore} disabled={loadingMore} style={{ marginTop: 16 }}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
