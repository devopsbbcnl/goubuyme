'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AddVendorModal } from '@/components/vendor/AddVendorModal';
import { api } from '@/lib/api';

type Status = 'APPROVED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';
type DocStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
type LicenseStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
type LicenseType = 'NAFDAC' | 'PHARMACIST' | 'FOOD_HANDLER' | 'BUSINESS_PERMIT' | 'IMPORT_PERMIT';

interface Vendor {
  id: string; businessName: string; ownerName: string; category: string;
  city: string; totalOrders: number; totalRevenue: number;
  rating: number; approvalStatus: Status; createdAt: string;
}

interface VendorDetail {
  id: string; businessName: string; slug: string; description: string | null;
  logo: string | null; coverImage: string | null; category: string;
  address: string; city: string; state: string;
  latitude: number | null; longitude: number | null;
  isOpen: boolean; approvalStatus: Status; commissionTier: string;
  rating: number; totalRatings: number;
  openingTime: string | null; closingTime: string | null; avgDeliveryTime: number | null;
  createdAt: string; updatedAt: string;
  totalOrders: number; totalMenuItems: number; totalRevenue: number;
  user: {
    name: string; email: string; phone: string | null;
    isEmailVerified: boolean; isActive: boolean; createdAt: string;
  };
  document: {
    id: string; type: string; number: string;
    imageUrl: string; imageUrlBack: string | null;
    status: DocStatus; reviewNote: string | null;
    createdAt: string; updatedAt: string;
  } | null;
  licenses: License[];
}

interface License {
  id: string;
  type: LicenseType;
  licenseNumber: string;
  imageUrl: string;
  expiresAt: string | null;
  status: LicenseStatus;
  reviewNote: string | null;
  createdAt: string;
}

const fmtCurrency = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return n === 0 ? '₦0' : `₦${n.toLocaleString()}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const capFirst = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const DOC_STATUS_COLORS: Record<DocStatus, { bg: string; text: string }> = {
  PENDING:  { bg: '#FFF3CD', text: '#856404' },
  VERIFIED: { bg: '#D1FAE5', text: '#065F46' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B' },
};

const LIC_STATUS_COLORS: Record<LicenseStatus, { bg: string; text: string }> = {
  PENDING:  { bg: '#FFF3CD', text: '#856404' },
  VERIFIED: { bg: '#D1FAE5', text: '#065F46' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B' },
  EXPIRED:  { bg: '#F3F4F6', text: '#6B7280' },
};

const LICENSE_LABELS: Record<LicenseType, string> = {
  NAFDAC:          'NAFDAC Registration',
  PHARMACIST:      'Pharmacist License',
  FOOD_HANDLER:    'Food Handler Permit',
  BUSINESS_PERMIT: 'Business Operating Permit',
  IMPORT_PERMIT:   'Import / Trade Permit',
};

export default function VendorsPage() {
  const { theme: T } = useTheme();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const [search, setSearch] = useState('');

  // Detail modal
  const [addVendorOpen, setAddVendorOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [docActing, setDocActing] = useState(false);
  const [licActing, setLicActing] = useState<string | null>(null);
  const [licReviewNotes, setLicReviewNotes] = useState<Record<string, string>>({});

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Vendor[] }>('/admin/vendors?limit=100');
      setVendors(res.data);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const setStatus = async (id: string, status: Status) => {
    setVendors(vs => vs.map(v => v.id === id ? { ...v, approvalStatus: status } : v));
    if (detail?.id === id) setDetail(d => d ? { ...d, approvalStatus: status } : d);
    try {
      await api.patch(`/admin/vendors/${id}/status`, { status });
    } catch {
      fetchVendors();
    }
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setReviewNote('');
    setDetailLoading(true);
    try {
      const res = await api.get<{ data: VendorDetail }>(`/admin/vendors/${id}`);
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
      await api.patch(`/admin/vendors/${detail.id}/document/status`, {
        status,
        reviewNote: reviewNote.trim() || undefined,
      });
      setDetail(d => d ? {
        ...d,
        document: d.document ? { ...d.document, status, reviewNote: reviewNote.trim() || null } : null,
      } : d);
      setReviewNote('');
    } catch {
      // show nothing — backend will have validated
    } finally {
      setDocActing(false);
    }
  };

  const reviewLicense = async (licenseId: string, status: 'VERIFIED' | 'REJECTED') => {
    if (!detail) return;
    setLicActing(licenseId);
    try {
      const note = licReviewNotes[licenseId]?.trim();
      await api.patch(`/admin/vendors/${detail.id}/licenses/${licenseId}/status`, {
        status,
        reviewNote: note || undefined,
      });
      setDetail(d => d ? {
        ...d,
        licenses: d.licenses.map(l => l.id === licenseId
          ? { ...l, status, reviewNote: note || null }
          : l),
      } : d);
      setLicReviewNotes(n => ({ ...n, [licenseId]: '' }));
    } catch {
      // keep existing state
    } finally {
      setLicActing(null);
    }
  };

  const filtered = vendors.filter(v =>
    (filter === 'ALL' || v.approvalStatus === filter) &&
    (!search || v.businessName.toLowerCase().includes(search.toLowerCase()))
  );

  const tabs: Array<'ALL' | Status> = ['ALL', 'PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'];

  return (
    <>
      <AddVendorModal
        open={addVendorOpen}
        onClose={() => setAddVendorOpen(false)}
        onCreated={() => { setAddVendorOpen(false); fetchVendors(); }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Vendors</div>
            <div style={{ fontSize: 13, color: T.textSec }}>
              {loading ? 'Loading…' : `${vendors.length} total · ${vendors.filter(v => v.approvalStatus === 'PENDING').length} pending`}
            </div>
          </div>
          <button onClick={() => setAddVendorOpen(true)} style={{ padding: '10px 20px', borderRadius: 4, background: T.primary, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            + Add Vendor
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
                    {vendors.filter(v => v.approvalStatus === t).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search vendors…"
            style={{
              background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
              padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', width: 220,
            }}
          />
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Vendor', 'Owner', 'Category', 'City', 'Orders', 'Revenue', 'Rating', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    Loading vendors…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
                    No vendors match the current filter.
                  </td>
                </tr>
              ) : filtered.map(v => (
                <tr
                  key={v.id}
                  onClick={() => openDetail(v.id)}
                  style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{v.businessName}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{v.id.slice(0, 8)}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{v.ownerName}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{capFirst(v.category)}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.textSec }}>{v.city}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{v.totalOrders}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.success }}>{fmtCurrency(v.totalRevenue)}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, color: T.text }}>
                    {v.rating > 0 ? `⭐ ${v.rating.toFixed(1)}` : '—'}
                  </td>
                  <td style={{ padding: '13px 16px' }}><Badge status={v.approvalStatus} /></td>
                  <td style={{ padding: '13px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {v.approvalStatus === 'PENDING' && <>
                        <button onClick={() => setStatus(v.id, 'APPROVED')} style={{ padding: '5px 10px', borderRadius: 4, border: 'none', background: T.success, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Approve</button>
                        <button onClick={() => setStatus(v.id, 'REJECTED')} style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${T.error}`, background: 'none', color: T.error, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Reject</button>
                      </>}
                      {v.approvalStatus === 'APPROVED' && (
                        <button onClick={() => setStatus(v.id, 'SUSPENDED')} style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${T.warning}`, background: 'none', color: T.warning, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Suspend</button>
                      )}
                      {(v.approvalStatus === 'SUSPENDED' || v.approvalStatus === 'REJECTED') && (
                        <button onClick={() => setStatus(v.id, 'APPROVED')} style={{ padding: '5px 10px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Reinstate</button>
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
        title={detail?.businessName ?? 'Vendor Detail'}
        width={780}
      >
        {detailLoading || !detail ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
            {detailLoading ? 'Loading…' : 'Failed to load vendor.'}
          </div>
        ) : (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Cover image */}
            {detail.coverImage && (
              <div style={{
                height: 160, borderRadius: 4, overflow: 'hidden',
                background: T.surface2, position: 'relative',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.coverImage} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {detail.logo && (
                  <div style={{
                    position: 'absolute', bottom: 12, left: 12,
                    width: 56, height: 56, borderRadius: 4,
                    border: `2px solid ${T.surface}`, overflow: 'hidden', background: T.surface2,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Orders', value: detail.totalOrders },
                { label: 'Revenue', value: fmtCurrency(detail.totalRevenue) },
                { label: 'Menu Items', value: detail.totalMenuItems },
                { label: 'Rating', value: detail.rating > 0 ? `${detail.rating.toFixed(1)} (${detail.totalRatings})` : '—' },
              ].map(s => (
                <div key={s.label} style={{ background: T.surface2, borderRadius: 4, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: T.textSec, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Business info */}
              <div>
                <SectionHead label="Business Info" T={T} />
                <InfoGrid rows={[
                  ['Category', capFirst(detail.category)],
                  ['Tier', detail.commissionTier === 'TIER_2' ? 'Growth (7.5%)' : 'Starter (3%)'],
                  ['Status', detail.approvalStatus],
                  ['Address', detail.address],
                  ['City / State', `${detail.city}, ${detail.state}`],
                  ['Hours', detail.openingTime && detail.closingTime ? `${detail.openingTime} – ${detail.closingTime}` : '—'],
                  ['Avg Delivery', detail.avgDeliveryTime ? `${detail.avgDeliveryTime} min` : '—'],
                  ['Joined', fmtDate(detail.createdAt)],
                ]} T={T} />
              </div>

              {/* Owner info */}
              <div>
                <SectionHead label="Owner" T={T} />
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

            {/* Description */}
            {detail.description && (
              <div>
                <SectionHead label="Description" T={T} />
                <p style={{ fontSize: 13, color: T.textSec, margin: 0, lineHeight: 1.6 }}>{detail.description}</p>
              </div>
            )}

            {/* Document section */}
            <div>
              <SectionHead label="Identity Document" T={T} />
              {!detail.document ? (
                <p style={{ fontSize: 13, color: T.textSec, margin: 0 }}>No document submitted yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <InfoGrid rows={[
                    ['Type', detail.document.type.replace('_', "'s ").replace('DRIVERS', "Driver's")],
                    ['Number', detail.document.number],
                    ['Submitted', fmtDate(detail.document.createdAt)],
                    ['Last updated', fmtDate(detail.document.updatedAt)],
                  ]} T={T} />

                  {/* Current status badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Current status:</span>
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
                  <div style={{ display: 'flex', gap: 12 }}>
                    <DocImage
                      label={detail.document.imageUrlBack ? 'Front' : 'Document'}
                      url={detail.document.imageUrl}
                      T={T}
                    />
                    {detail.document.imageUrlBack && (
                      <DocImage label="Back" url={detail.document.imageUrlBack} T={T} />
                    )}
                  </div>

                  {/* Review actions */}
                  <div style={{
                    background: T.surface2, borderRadius: 4,
                    padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Review Note (optional)</div>
                    <textarea
                      value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                      placeholder="Add a note for the vendor (shown on rejection)…"
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
                          border: `1px solid ${T.error}`,
                          background: 'none',
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

            {/* Licenses & Permits */}
            <div>
              <SectionHead label="Licenses & Permits" T={T} />
              {!detail.licenses || detail.licenses.length === 0 ? (
                <p style={{ fontSize: 13, color: T.textSec, margin: 0 }}>No licenses submitted yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {detail.licenses.map(lic => {
                    const acting = licActing === lic.id;
                    const sc = LIC_STATUS_COLORS[lic.status];
                    return (
                      <div key={lic.id} style={{
                        border: `1px solid ${T.border}`, borderRadius: 4,
                        padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                            {LICENSE_LABELS[lic.type] ?? lic.type}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 999,
                            padding: '3px 10px', background: sc.bg, color: sc.text,
                          }}>
                            {lic.status}
                          </span>
                        </div>

                        <InfoGrid rows={[
                          ['License No.', lic.licenseNumber],
                          ['Submitted', fmtDate(lic.createdAt)],
                          ...(lic.expiresAt ? [['Expires', fmtDate(lic.expiresAt)] as [string, string]] : []),
                        ]} T={T} />

                        {lic.reviewNote && (
                          <div style={{ fontSize: 12, color: T.textSec }}>
                            Admin note: {lic.reviewNote}
                          </div>
                        )}

                        <DocImage label="License Image" url={lic.imageUrl} T={T} />

                        <div style={{ background: T.surface2, borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Review Note (optional)</div>
                          <textarea
                            value={licReviewNotes[lic.id] ?? ''}
                            onChange={e => setLicReviewNotes(n => ({ ...n, [lic.id]: e.target.value }))}
                            placeholder="Add a note for the vendor (shown on rejection)…"
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
                              disabled={acting || lic.status === 'VERIFIED'}
                              onClick={() => reviewLicense(lic.id, 'VERIFIED')}
                              style={{
                                padding: '8px 18px', borderRadius: 4, border: 'none',
                                background: acting || lic.status === 'VERIFIED' ? T.surface2 : T.success,
                                color: acting || lic.status === 'VERIFIED' ? T.textSec : '#fff',
                                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                cursor: acting || lic.status === 'VERIFIED' ? 'default' : 'pointer',
                              }}
                            >
                              {acting ? 'Saving…' : '✓ Verify'}
                            </button>
                            <button
                              disabled={acting || lic.status === 'REJECTED'}
                              onClick={() => reviewLicense(lic.id, 'REJECTED')}
                              style={{
                                padding: '8px 18px', borderRadius: 4,
                                border: `1px solid ${T.error}`, background: 'none',
                                color: acting || lic.status === 'REJECTED' ? T.textSec : T.error,
                                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                cursor: acting || lic.status === 'REJECTED' ? 'default' : 'pointer',
                              }}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Account status actions */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <SectionHead label="Account Status" T={T} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {detail.approvalStatus === 'PENDING' && <>
                  <ActionButton label="Approve Account" color={T.success} textColor="#fff" onClick={() => setStatus(detail.id, 'APPROVED')} />
                  <ActionButton label="Reject Account" color="none" border={T.error} textColor={T.error} onClick={() => setStatus(detail.id, 'REJECTED')} />
                </>}
                {detail.approvalStatus === 'APPROVED' && (
                  <ActionButton label="Suspend Account" color="none" border={T.warning} textColor={T.warning} onClick={() => setStatus(detail.id, 'SUSPENDED')} />
                )}
                {(detail.approvalStatus === 'SUSPENDED' || detail.approvalStatus === 'REJECTED') && (
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
          <span style={{ fontSize: 12, color: T.textSec, minWidth: 100, flexShrink: 0 }}>{key}</span>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, wordBreak: 'break-word' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function DocImage({ label, url, T }: { label: string; url: string; T: Record<string, string> }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>{label}</div>
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url} alt={label}
          style={{
            width: '100%', height: 140, objectFit: 'cover',
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
