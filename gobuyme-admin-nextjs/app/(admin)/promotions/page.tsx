'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
type Tab = Status | 'LIVE' | 'ALL';

interface Promo {
  id: string;
  title: string;
  imageUrl: string;
  imagePosition: string | null;
  code: string | null;
  isActive: boolean;
  approvalStatus: Status;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  vendor: { id: string; businessName: string; city: string; state: string | null; category: string; commissionTier: string; approvalStatus: string };
}
interface Counts { PENDING: number; APPROVED: number; REJECTED: number; live: number }

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'PENDING', label: 'Needs review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'LIVE', label: 'Live now' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export default function PromotionsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const canReview = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [tab, setTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [rows, setRows] = useState<Promo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Counts>({ PENDING: 0, APPROVED: 0, REJECTED: 0, live: 0 });
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Promo | null>(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Promo | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(perPage) });
    params.set('status', tab === 'LIVE' ? 'APPROVED' : tab);
    if (tab === 'LIVE') params.set('live', 'true');
    if (query) params.set('search', query);
    try {
      const res = await api.get<{ data: Promo[]; counts: Counts; pagination: { total: number } }>(`/admin/promotions?${params}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setCounts(res.counts);
    } catch (e) {
      setRows(prev => prev ?? []);
      setMessage({ text: e instanceof Error ? e.message : 'Failed to load promotions.', ok: false });
    }
  }, [tab, query, page, perPage]);

  useEffect(() => { void load(); }, [load]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const afterChange = (text: string) => {
    setMessage({ text, ok: true });
    window.dispatchEvent(new Event('gbm:pending-counts-updated'));
    void load();
  };

  const approve = async (p: Promo) => {
    setBusyId(p.id); setMessage(null);
    try {
      await api.patch(`/admin/promotions/${p.id}/approve`, {});
      afterChange(`"${p.title}" approved.`);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not approve.', ok: false });
    } finally { setBusyId(null); }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id); setMessage(null);
    try {
      await api.patch(`/admin/promotions/${rejecting.id}/reject`, { reason: reason.trim() });
      const title = rejecting.title;
      setRejecting(null); setReason('');
      afterChange(`"${title}" rejected. The vendor was told why.`);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not reject.', ok: false });
    } finally { setBusyId(null); }
  };

  const statusColor = (s: Status) => (s === 'APPROVED' ? [T.success, T.successBg] : s === 'REJECTED' ? [T.error, T.errorBg] : [T.warning, T.warningBg]);
  const tabCount = (k: Tab) => (k === 'PENDING' ? counts.PENDING : k === 'APPROVED' ? counts.APPROVED : k === 'REJECTED' ? counts.REJECTED : k === 'LIVE' ? counts.live : counts.PENDING + counts.APPROVED + counts.REJECTED);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0 }}>Promotions</h1>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>
          Vendor promo cards are reviewed here before they can appear on the customer home carousel. Editing an approved card sends it back for review.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
            style={{ padding: '8px 14px', borderRadius: 4, border: `1px solid ${tab === t.key ? T.primary : T.border}`, background: tab === t.key ? T.primary : T.surface, color: tab === t.key ? '#fff' : T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t.label} <span style={{ opacity: 0.8, fontWeight: 600 }}>({tabCount(t.key)})</span>
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor or title"
          style={{ marginLeft: 'auto', minWidth: 220, padding: '8px 12px', borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13 }} />
      </div>

      {message && (
        <div role="status" style={{ padding: '10px 14px', borderRadius: 4, fontSize: 13, fontWeight: 600, background: message.ok ? T.successBg : T.errorBg, color: message.ok ? T.success : T.error }}>
          {message.text}
        </div>
      )}

      {rows === null ? (
        <div style={{ color: T.textMuted, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, color: T.textSec, fontSize: 14 }}>
          {tab === 'PENDING' ? 'Nothing waiting for review.' : 'No promotions match.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {rows.map(p => {
            const [fg, bg] = statusColor(p.approvalStatus);
            return (
              <div key={p.id} style={{ borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => setPreview(p)} aria-label={`Preview ${p.title}`} style={{ padding: 0, border: 0, cursor: 'zoom-in', background: T.surface2, aspectRatio: '1080 / 580' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: p.imagePosition ?? '50% 50%', display: 'block' }} />
                </button>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 4, color: fg, background: bg }}>{p.approvalStatus}</span>
                    {p.isActive && <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 4, color: '#fff', background: T.primary }}>LIVE</span>}
                    {p.vendor.commissionTier !== 'TIER_2' && <span style={{ fontSize: 11, fontWeight: 700, color: T.warning }}>Vendor is no longer on Growth Plan</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: T.textSec }}>
                    {p.vendor.businessName} · {p.vendor.city}{p.vendor.state ? `, ${p.vendor.state}` : ''}
                  </div>
                  {p.code && <div style={{ fontSize: 12, color: T.textSec }}>Code: <b style={{ color: T.text }}>{p.code}</b></div>}
                  <div style={{ fontSize: 11, color: T.textMuted }}>Submitted {fmt(p.updatedAt)}{p.reviewedAt ? ` · Reviewed ${fmt(p.reviewedAt)}` : ''}</div>
                  {p.rejectionReason && p.approvalStatus === 'REJECTED' && (
                    <div style={{ fontSize: 12, color: T.error }}>Reason: {p.rejectionReason}</div>
                  )}
                  {canReview && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                      {p.approvalStatus !== 'APPROVED' && (
                        <button disabled={busyId === p.id} onClick={() => approve(p)}
                          style={{ flex: 1, padding: '9px 0', borderRadius: 4, border: 0, background: T.success, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busyId === p.id ? 0.6 : 1 }}>
                          Approve
                        </button>
                      )}
                      {p.approvalStatus !== 'REJECTED' && (
                        <button disabled={busyId === p.id} onClick={() => { setRejecting(p); setReason(''); }}
                          style={{ flex: 1, padding: '9px 0', borderRadius: 4, border: `1px solid ${T.error}`, background: 'transparent', color: T.error, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          {p.approvalStatus === 'APPROVED' ? 'Take down' : 'Reject'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination total={total} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={n => { setPerPage(n); setPage(1); }} />

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={rejecting?.approvalStatus === 'APPROVED' ? 'Take down promotion' : 'Reject promotion'} width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {rejecting?.vendor.businessName} will see this reason and can edit the card and resubmit it.
          </div>
          <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={4} placeholder="e.g. Image text is cut off; please keep text 60px from the edges."
            style={{ padding: 10, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setRejecting(null)} style={{ padding: '9px 16px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button disabled={reason.trim().length < 5 || busyId === rejecting?.id} onClick={reject}
              style={{ padding: '9px 16px', borderRadius: 4, border: 0, background: T.error, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: reason.trim().length < 5 ? 0.5 : 1 }}>
              {rejecting?.approvalStatus === 'APPROVED' ? 'Take down' : 'Reject'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title} width={900}>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.imageUrl} alt={preview.title} style={{ width: '100%', aspectRatio: '1080 / 580', objectFit: 'cover', objectPosition: preview.imagePosition ?? '50% 50%', borderRadius: 4 }} />
        )}
      </Modal>
    </div>
  );
}
