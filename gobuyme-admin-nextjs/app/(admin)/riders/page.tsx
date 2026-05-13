'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AddRiderModal } from '@/components/rider/AddRiderModal';
import { api } from '@/lib/api';

type RiderStatus = 'APPROVED' | 'PENDING' | 'SUSPENDED';
type DocStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface Rider {
  id: string; name: string; phone: string | null; vehicleType: string;
  plateNumber: string | null; totalDeliveries: number; totalEarnings: number;
  rating: number; approvalStatus: RiderStatus; isOnline: boolean; createdAt: string;
}

interface RiderDetail {
  id: string; vehicleType: string; plateNumber: string | null;
  isOnline: boolean; isAvailable: boolean; approvalStatus: RiderStatus;
  rating: number; totalRatings: number;
  latitude: number | null; longitude: number | null;
  createdAt: string; updatedAt: string;
  totalDeliveries: number; totalEarnings: number;
  user: {
    name: string; email: string; phone: string | null; avatar: string | null;
    isEmailVerified: boolean; isActive: boolean; createdAt: string;
  };
  document: {
    id: string; ninNumber: string;
    ninImageUrl: string | null; selfieUrl: string | null; vehicleImageUrl: string | null;
    guarantorName: string | null; guarantorPhone: string | null; guarantorAddress: string | null;
    status: DocStatus; reviewNote: string | null;
    createdAt: string; updatedAt: string;
  } | null;
}

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return n === 0 ? '₦0' : `₦${n.toLocaleString()}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const DOC_STATUS_COLORS: Record<DocStatus, { bg: string; text: string }> = {
  PENDING:  { bg: '#FFF3CD', text: '#856404' },
  VERIFIED: { bg: '#D1FAE5', text: '#065F46' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B' },
};

export default function RidersPage() {
  const { theme: T } = useTheme();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [addRiderOpen, setAddRiderOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | RiderStatus>('ALL');
  const [search, setSearch] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<RiderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [docActing, setDocActing] = useState(false);

  const fetchRiders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Rider[] }>('/admin/riders?limit=100');
      setRiders(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  const setStatus = async (id: string, status: RiderStatus) => {
    setRiders(rs => rs.map(r => r.id === id ? { ...r, approvalStatus: status } : r));
    if (detail?.id === id) setDetail(d => d ? { ...d, approvalStatus: status } : d);
    try {
      await api.patch(`/admin/riders/${id}/status`, { status });
    } catch {
      fetchRiders();
    }
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setReviewNote('');
    setDetailLoading(true);
    try {
      const res = await api.get<{ data: RiderDetail }>(`/admin/riders/${id}`);
      setDetail(res.data);
    } catch {
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const reviewDocument = async (status: 'VERIFIED' | 'REJECTED') => {
    if (!detail) return;
    setDocActing(true);
    try {
      await api.patch(`/admin/riders/${detail.id}/document/status`, {
        status,
        reviewNote: reviewNote.trim() || undefined,
      });
      setDetail(d => d ? {
        ...d,
        document: d.document ? { ...d.document, status, reviewNote: reviewNote.trim() || null } : null,
      } : d);
      setReviewNote('');
    } catch {
      // backend validated
    } finally {
      setDocActing(false);
    }
  };

  const filtered = riders.filter(r =>
    (filter === 'ALL' || r.approvalStatus === filter) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  const tabs: Array<'ALL' | RiderStatus> = ['ALL', 'PENDING', 'APPROVED', 'SUSPENDED'];
  const onlineCount = riders.filter(r => r.isOnline).length;

  return (
    <>
      <AddRiderModal
        open={addRiderOpen}
        onClose={() => setAddRiderOpen(false)}
        onCreated={() => { setAddRiderOpen(false); fetchRiders(); }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Riders</div>
            <div style={{ fontSize: 13, color: T.textSec }}>
              {loading ? 'Loading…' : `${riders.length} total · ${riders.filter(r => r.approvalStatus === 'PENDING').length} pending · ${onlineCount} online`}
            </div>
          </div>
          <button onClick={() => setAddRiderOpen(true)} style={{ padding: '10px 20px', borderRadius: 4, background: T.primary, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            + Add Rider
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: '7px 14px', borderRadius: 4,
                border: filter === t ? `1px solid ${T.primary}` : 'none',
                background: filter === t ? T.primaryTint : T.surface2,
                color: filter === t ? T.primary : T.textSec,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                {t}
                {t !== 'ALL' && (
                  <span style={{ opacity: 0.6, marginLeft: 4 }}>
                    {riders.filter(r => r.approvalStatus === t).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search riders…"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 220 }}
          />
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Rider', 'Phone', 'Vehicle', 'Plate', 'Deliveries', 'Earned', 'Rating', 'Status', 'Online', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    Loading riders…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    No riders match the current filter.
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => openDetail(r.id)}
                  style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{fmtDate(r.createdAt)}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{r.phone ?? '—'}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{r.vehicleType}</td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{r.plateNumber ?? 'N/A'}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{r.totalDeliveries}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.success }}>{fmtCurrency(r.totalEarnings)}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.text }}>
                    {r.rating > 0 ? `⭐ ${r.rating.toFixed(1)}` : '—'}
                  </td>
                  <td style={{ padding: '13px 16px' }}><Badge status={r.approvalStatus} /></td>
                  <td style={{ padding: '13px 16px' }}>
                    <Badge status={r.isOnline ? 'ONLINE' : 'OFFLINE'} />
                  </td>
                  <td style={{ padding: '13px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.approvalStatus === 'PENDING' && (
                        <button onClick={() => setStatus(r.id, 'APPROVED')} style={{ padding: '5px 10px', borderRadius: 4, border: 'none', background: T.success, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Approve</button>
                      )}
                      {r.approvalStatus === 'APPROVED' && (
                        <button onClick={() => setStatus(r.id, 'SUSPENDED')} style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${T.warning}`, background: 'none', color: T.warning, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Suspend</button>
                      )}
                      {r.approvalStatus === 'SUSPENDED' && (
                        <button onClick={() => setStatus(r.id, 'APPROVED')} style={{ padding: '5px 10px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Reinstate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.user.name ?? 'Rider Detail'}
        width={740}
      >
        {detailLoading || !detail ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
            {detailLoading ? 'Loading…' : 'Failed to load rider.'}
          </div>
        ) : (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Profile header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: T.surface2, border: `2px solid ${T.border}`,
                overflow: 'hidden', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, color: T.textSec,
              }}>
                {detail.user.avatar
                  ? /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={detail.user.avatar} alt={detail.user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : detail.user.name.charAt(0).toUpperCase()
                }
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{detail.user.name}</div>
                <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>{detail.user.email}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Badge status={detail.approvalStatus} />
                  <Badge status={detail.isOnline ? 'ONLINE' : 'OFFLINE'} />
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Deliveries', value: detail.totalDeliveries },
                { label: 'Earnings', value: fmtCurrency(detail.totalEarnings) },
                { label: 'Rating', value: detail.rating > 0 ? `${detail.rating.toFixed(1)} (${detail.totalRatings})` : '—' },
                { label: 'Status', value: detail.isOnline ? 'Online' : 'Offline' },
              ].map(s => (
                <div key={s.label} style={{ background: T.surface2, borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: T.textSec, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Rider info */}
              <div>
                <SectionHead label="Rider Info" T={T} />
                <InfoGrid rows={[
                  ['Vehicle Type', detail.vehicleType],
                  ['Plate Number', detail.plateNumber ?? '—'],
                  ['Approval', detail.approvalStatus],
                  ['Available', detail.isAvailable ? 'Yes' : 'No'],
                  ['Joined', fmtDate(detail.createdAt)],
                ]} T={T} />
              </div>

              {/* Account info */}
              <div>
                <SectionHead label="Account" T={T} />
                <InfoGrid rows={[
                  ['Name', detail.user.name],
                  ['Email', detail.user.email],
                  ['Phone', detail.user.phone ?? '—'],
                  ['Email verified', detail.user.isEmailVerified ? 'Yes' : 'No'],
                  ['Account active', detail.user.isActive ? 'Yes' : 'No'],
                  ['Registered', fmtDate(detail.user.createdAt)],
                ]} T={T} />
              </div>
            </div>

            {/* Document section */}
            <div>
              <SectionHead label="Identity & Vehicle Documents" T={T} />
              {!detail.document ? (
                <p style={{ fontSize: 13, color: T.textSec, margin: 0 }}>No documents submitted yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <InfoGrid rows={[
                    ['NIN Number', detail.document.ninNumber],
                    ['Submitted', fmtDate(detail.document.createdAt)],
                    ['Last updated', fmtDate(detail.document.updatedAt)],
                    ...(detail.document.guarantorName ? [['Guarantor', detail.document.guarantorName] as [string, string]] : []),
                    ...(detail.document.guarantorPhone ? [['Guarantor Phone', detail.document.guarantorPhone] as [string, string]] : []),
                    ...(detail.document.guarantorAddress ? [['Guarantor Address', detail.document.guarantorAddress] as [string, string]] : []),
                  ]} T={T} />

                  {/* Current status badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Document status:</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, borderRadius: 999,
                      padding: '3px 10px',
                      background: DOC_STATUS_COLORS[detail.document.status].bg,
                      color: DOC_STATUS_COLORS[detail.document.status].text,
                    }}>
                      {detail.document.status}
                    </span>
                    {detail.document.reviewNote && (
                      <span style={{ fontSize: 12, color: T.textSec }}>— {detail.document.reviewNote}</span>
                    )}
                  </div>

                  {/* Document images */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {detail.document.ninImageUrl && (
                      <DocImage label="NIN" url={detail.document.ninImageUrl} T={T} />
                    )}
                    {detail.document.selfieUrl && (
                      <DocImage label="Selfie" url={detail.document.selfieUrl} T={T} />
                    )}
                    {detail.document.vehicleImageUrl && (
                      <DocImage label="Vehicle" url={detail.document.vehicleImageUrl} T={T} />
                    )}
                  </div>

                  {/* Review actions */}
                  <div style={{ background: T.surface2, borderRadius: 4, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Review Note (optional)</div>
                    <textarea
                      value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                      placeholder="Add a note for the rider (shown on rejection)…"
                      rows={2}
                      style={{
                        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4,
                        padding: '8px 12px', color: T.text, fontSize: 13,
                        outline: 'none', resize: 'vertical', fontFamily: 'inherit', width: '100%',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        disabled={docActing || detail.document.status === 'VERIFIED'}
                        onClick={() => reviewDocument('VERIFIED')}
                        style={{
                          padding: '8px 18px', borderRadius: 4, border: 'none',
                          background: docActing || detail.document.status === 'VERIFIED' ? T.surface2 : T.success,
                          color: docActing || detail.document.status === 'VERIFIED' ? T.textSec : '#fff',
                          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                          cursor: docActing || detail.document.status === 'VERIFIED' ? 'default' : 'pointer',
                        }}
                      >
                        {docActing ? 'Saving…' : '✓ Verify Document'}
                      </button>
                      <button
                        disabled={docActing || detail.document.status === 'REJECTED'}
                        onClick={() => reviewDocument('REJECTED')}
                        style={{
                          padding: '8px 18px', borderRadius: 4,
                          border: `1px solid ${T.error}`, background: 'none',
                          color: docActing || detail.document.status === 'REJECTED' ? T.textSec : T.error,
                          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                          cursor: docActing || detail.document.status === 'REJECTED' ? 'default' : 'pointer',
                        }}
                      >
                        ✕ Reject Document
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Account status actions */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <SectionHead label="Account Status" T={T} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {detail.approvalStatus === 'PENDING' && (
                  <ActionButton label="Approve Account" color={T.success} textColor="#fff" onClick={() => setStatus(detail.id, 'APPROVED')} />
                )}
                {detail.approvalStatus === 'APPROVED' && (
                  <ActionButton label="Suspend Account" color="none" border={T.warning} textColor={T.warning} onClick={() => setStatus(detail.id, 'SUSPENDED')} />
                )}
                {detail.approvalStatus === 'SUSPENDED' && (
                  <ActionButton label="Reinstate Account" color={T.primary} textColor="#fff" onClick={() => setStatus(detail.id, 'APPROVED')} />
                )}
                <div style={{ fontSize: 13, color: T.textSec, display: 'flex', alignItems: 'center', marginLeft: 4 }}>
                  Current: <Badge status={detail.approvalStatus} />
                </div>
              </div>
            </div>

          </div>
        )}
      </Modal>
    </>
  );
}

function SectionHead({ label, T }: { label: string; T: Record<string, string> }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
      {label}
    </div>
  );
}

function InfoGrid({ rows, T }: { rows: [string, string][]; T: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([key, val]) => (
        <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: T.textSec, minWidth: 110, flexShrink: 0 }}>{key}</span>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, wordBreak: 'break-word' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function DocImage({ label, url, T }: { label: string; url: string; T: Record<string, string> }) {
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>{label}</div>
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url} alt={label}
          style={{
            width: '100%', height: 130, objectFit: 'cover',
            borderRadius: 4, border: `1px solid ${T.border}`,
            display: 'block', cursor: 'zoom-in',
          }}
        />
        <div style={{ fontSize: 11, color: T.primary, marginTop: 4 }}>Open full size ↗</div>
      </a>
    </div>
  );
}

function ActionButton({
  label, color, border, textColor, onClick,
}: {
  label: string; color: string; border?: string; textColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 4,
        border: border ? `1px solid ${border}` : 'none',
        background: color === 'none' ? 'transparent' : color,
        color: textColor, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
