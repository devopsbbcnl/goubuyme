'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Theme = Record<string, string>;

/** Everything about a vendor that the main detail card does not already show. */
export interface FullDetail {
  id: string;
  businessName: string;
  isBranch?: boolean;
  branchLabel?: string | null;
  contactPhone?: string | null;
  notifyOwnerOfOrders?: boolean;
  /** The separate login the owner gave this branch's manager, if any. */
  manager?: { id: string; name: string; email: string; phone: string | null; isActive: boolean; createdAt: string } | null;
  parent?: { id: string; businessName: string; approvalStatus: string } | null;
  branches?: {
    id: string; businessName: string; branchLabel: string | null; address: string; city: string;
    approvalStatus: string; isOpen: boolean; rating: number; _count: { orders: number; menuItems: number };
    manager?: { name: string; email: string; isActive: boolean } | null;
  }[];
  timezone?: string;
  availabilityOverride?: string;
  autoApprove?: boolean;
  isPharmacyFlagged?: boolean;
  isFeatured?: boolean;
  featuredUntil?: string | null;
  displayOrder?: number;
  tierChangedAt?: string | null;
  subcategory?: string | null;
  businessHours?: { id: string; dayOfWeek: number; openTime: string; closeTime: string }[];
  temporaryClosures?: { id: string; startAt: string; endAt: string | null; reason: string | null }[];
  vendorPromotions?: { id: string; title: string; imageUrl: string; code: string | null; isActive: boolean; approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'; rejectionReason?: string | null; createdAt: string }[];
  incidents?: { id: string; orderId: string; incidentType: string; createdAt: string }[];
  payoutAccount?: { bankName: string; accountName: string; accountNumberMasked: string; hasTransferRecipient: boolean } | null;
  payoutSummary?: { status: string; count: number; netAmount: number }[];
  recentOrders?: { id: string; orderNumber: string; status: string; paymentStatus: string; subtotal: number; totalAmount: number; createdAt: string; customer: string }[];
  menuSummary?: { total: number; available: number; outOfStock: number; totalStockUnits: number };
}

interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  image: string | null; category: string | null;
  isAvailable: boolean; isFeatured: boolean; stockQuantity: number;
  createdAt: string; updatedAt: string; timesOrdered: number;
  drinkOptions: { id: string; name: string; price: number; isAvailable: boolean }[];
  optionGroups: { id: string; name: string; required: boolean; items: { id: string; name: string; extraPrice: number; isAvailable: boolean }[] }[];
}
interface MenuResponse {
  vendor: { id: string; businessName: string };
  summary: { total: number; available: number; outOfStock: number; lowStock: number; lowStockThreshold: number; totalStockUnits: number };
  categories: string[];
  items: MenuItem[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const when = (iso: string) => new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Head({ label, T }: { label: string; T: Theme }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{label}</div>;
}

function Pill({ text, tone, T }: { text: string; tone: 'good' | 'warn' | 'bad' | 'neutral'; T: Theme }) {
  const c = tone === 'good' ? [T.success, T.successBg] : tone === 'warn' ? [T.warning, T.warningBg] : tone === 'bad' ? [T.error, T.errorBg] : [T.textSec, T.surface3];
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: c[0], background: c[1], whiteSpace: 'nowrap' }}>{text}</span>;
}

function Rows({ rows, T }: { rows: [string, React.ReactNode][]; T: Theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: T.textSec, minWidth: 130, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 600, wordBreak: 'break-word' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/** The complete menu of one location: every item with stock, price, availability and all its options. */
function MenuPanel({ vendorId, T }: { vendorId: string; T: Theme }) {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [stock, setStock] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams();
    if (debounced.trim()) params.set('search', debounced.trim());
    if (stock !== 'all') params.set('stock', stock);
    if (category) params.set('category', category);
    api.get<{ data: MenuResponse }>(`/admin/vendors/${vendorId}/menu?${params}`)
      .then(r => setData(r.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [vendorId, debounced, stock, category]);

  const s = data?.summary;
  const tabBtn = (v: typeof stock, label: string) => (
    <button key={v} onClick={() => setStock(v)} style={{
      padding: '6px 12px', borderRadius: 4, border: stock === v ? `1px solid ${T.primary}` : 'none',
      background: stock === v ? T.primaryTint : T.surface2, color: stock === v ? T.primary : T.textSec,
      fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div>
      <Head label="Full menu" T={T} />
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
          {[
            ['Items', s.total], ['Available', s.available], ['Out of stock', s.outOfStock],
            [`Low stock (≤${s.lowStockThreshold})`, s.lowStock], ['Units in stock', s.totalStockUnits.toLocaleString()],
          ].map(([k, v]) => (
            <div key={String(k)} style={{ background: T.surface2, borderRadius: 4, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: T.textSec, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {tabBtn('all', 'All')}{tabBtn('available', 'Available')}{tabBtn('low', 'Low stock')}{tabBtn('out', 'Out of stock')}
        {!!data?.categories.length && (
          <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 10px', color: T.text, fontSize: 12 }}>
            <option value="">All categories</option>
            {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" aria-label="Search menu"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 12px', color: T.text, fontSize: 12, outline: 'none', flex: '1 1 140px', minWidth: 120 }} />
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading menu…</div>
      ) : failed || !data ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: T.error }}>Could not load the menu.</div>
      ) : data.items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: T.textSec }}>No items match.</div>
      ) : (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Item', 'Category', 'Price', 'Stock', 'Status', 'Ordered', 'Options'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', fontSize: 10, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map(it => {
                const optionCount = it.drinkOptions.length + it.optionGroups.reduce((n, g) => n + g.items.length, 0);
                const expanded = open === it.id;
                const stockTone = it.stockQuantity <= 0 ? 'bad' : it.stockQuantity <= data.summary.lowStockThreshold ? 'warn' : 'good';
                return (
                  <FragmentRow key={it.id}>
                    <tr style={{ borderTop: `1px solid ${T.border}`, cursor: optionCount || it.description ? 'pointer' : 'default' }}
                      onClick={() => setOpen(expanded ? null : it.id)}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {it.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={it.image} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 36, height: 36, borderRadius: 4, background: T.surface3, flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{it.name}{it.isFeatured ? ' ★' : ''}</div>
                            <div style={{ fontSize: 11, color: T.textMuted }}>Updated {new Date(it.updatedAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: T.textSec }}>{it.category ?? '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{money(it.price)}</td>
                      <td style={{ padding: '10px 12px' }}><Pill text={String(it.stockQuantity)} tone={stockTone} T={T} /></td>
                      <td style={{ padding: '10px 12px' }}><Pill text={it.isAvailable ? 'Listed' : 'Hidden'} tone={it.isAvailable ? 'good' : 'neutral'} T={T} /></td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: T.textSec }}>{it.timesOrdered}×</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: T.textSec }}>{optionCount ? `${optionCount} ${expanded ? '▾' : '▸'}` : '—'}</td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: T.surface2 }}>
                        <td colSpan={7} style={{ padding: '10px 16px' }}>
                          {it.description && <p style={{ margin: '0 0 8px', fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>{it.description}</p>}
                          {it.drinkOptions.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 4 }}>DRINK OPTIONS</div>
                              {it.drinkOptions.map(d => (
                                <div key={d.id} style={{ fontSize: 12, color: T.text }}>{d.name} · {money(d.price)} {!d.isAvailable && <Pill text="Hidden" tone="neutral" T={T} />}</div>
                              ))}
                            </div>
                          )}
                          {it.optionGroups.map(g => (
                            <div key={g.id} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 4 }}>{g.name.toUpperCase()}{g.required ? ' · REQUIRED' : ''}</div>
                              {g.items.map(o => (
                                <div key={o.id} style={{ fontSize: 12, color: T.text }}>{o.name}{o.extraPrice > 0 ? ` · +${money(o.extraPrice)}` : ''} {!o.isAvailable && <Pill text="Hidden" tone="neutral" T={T} />}</div>
                              ))}
                            </div>
                          ))}
                          <div style={{ fontSize: 11, color: T.textMuted }}>Added {when(it.createdAt)}</div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// A keyed wrapper so a data row and its expansion row can be returned together from map().
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function VendorFullDetail({ detail, T, onOpenVendor }: { detail: FullDetail; T: Theme; onOpenVendor: (id: string) => void }) {
  const link = (id: string, text: string) => (
    <button onClick={() => onOpenVendor(id)} style={{ color: T.primary, fontWeight: 700, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
      {text}
    </button>
  );

  const hoursByDay = DAYS.map((name, d) => ({
    name,
    slots: (detail.businessHours ?? []).filter(h => h.dayOfWeek === d),
  }));

  return (
    <>
      {/* Branch relationship */}
      {(detail.parent || (detail.branches && detail.branches.length > 0)) && (
        <div>
          <Head label={detail.parent ? 'Branch of' : `Branches (${detail.branches!.length})`} T={T} />
          {detail.parent ? (
            <Rows T={T} rows={[
              ['Main business', link(detail.parent.id, detail.parent.businessName)],
              ['Main status', <Pill key="s" text={detail.parent.approvalStatus} tone={detail.parent.approvalStatus === 'APPROVED' ? 'good' : 'warn'} T={T} />],
              ['Branch name', detail.branchLabel ?? '—'],
              ['Branch phone', detail.contactPhone ?? '—'],
              ['Run by', detail.manager ? detail.manager.name : 'The owner (no separate login)'],
              ...(detail.manager ? ([
                ['Manager email', detail.manager.email],
                ['Manager phone', detail.manager.phone ?? '—'],
                ['Login', <Pill key="l" text={detail.manager.isActive ? 'Active' : 'Access off'} tone={detail.manager.isActive ? 'good' : 'bad'} T={T} />],
                ['Login created', when(detail.manager.createdAt)],
                ['Owner also alerted', detail.notifyOwnerOfOrders ? 'Yes' : 'No'],
              ] as [string, React.ReactNode][]) : []),
            ]} />
          ) : (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.surface2 }}>
                    {['Branch', 'Address', 'Run by', 'Menu', 'Orders', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.branches!.map(b => (
                    <tr key={b.id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: '9px 12px' }}>{link(b.id, b.branchLabel ?? b.businessName)}</td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: T.textSec }}>{b.address}, {b.city}</td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: T.text }}>
                        {b.manager ? <>{b.manager.name}{!b.manager.isActive && <> <Pill text="Access off" tone="bad" T={T} /></>}</> : <span style={{ color: T.textMuted }}>Owner</span>}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: T.text }}>{b._count.menuItems}</td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: T.text }}>{b._count.orders}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <Pill text={b.approvalStatus === 'APPROVED' ? (b.isOpen ? 'Open' : 'Closed') : b.approvalStatus} tone={b.approvalStatus === 'APPROVED' ? (b.isOpen ? 'good' : 'neutral') : 'warn'} T={T} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <MenuPanel vendorId={detail.id} T={T} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        <div>
          <Head label="Opening hours" T={T} />
          {(detail.businessHours?.length ?? 0) === 0 ? (
            <div style={{ fontSize: 12, color: T.textSec }}>No weekly schedule set.</div>
          ) : (
            <Rows T={T} rows={hoursByDay.map(d => [d.name, d.slots.length ? d.slots.map(s => `${s.openTime}–${s.closeTime}`).join(', ') : 'Closed'])} />
          )}
          {(detail.temporaryClosures?.length ?? 0) > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>TEMPORARY CLOSURES</div>
              {detail.temporaryClosures!.map(c => (
                <div key={c.id} style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>
                  {when(c.startAt)} → {c.endAt ? when(c.endAt) : 'until reopened'}{c.reason ? ` · ${c.reason}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Head label="Settings and flags" T={T} />
          <Rows T={T} rows={[
            ['Open/closed mode', detail.availabilityOverride ?? '—'],
            ['Timezone', detail.timezone ?? '—'],
            ['Auto-approve', detail.autoApprove ? 'Yes' : 'No'],
            ['Pharmacy flagged', detail.isPharmacyFlagged ? 'Yes' : 'No'],
            ['Featured', detail.isFeatured ? `Yes${detail.featuredUntil ? ` until ${new Date(detail.featuredUntil).toLocaleDateString()}` : ''}` : 'No'],
            ['Display order', String(detail.displayOrder ?? 0)],
            ['Subcategory', detail.subcategory ?? '—'],
            ['Plan last changed', detail.tierChangedAt ? when(detail.tierChangedAt) : '—'],
          ]} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        <div>
          <Head label="Payouts" T={T} />
          {detail.isBranch && <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>Branches are paid into the main business&apos;s account.</div>}
          {detail.payoutAccount ? (
            <Rows T={T} rows={[
              ['Bank', detail.payoutAccount.bankName],
              ['Account name', detail.payoutAccount.accountName],
              ['Account number', detail.payoutAccount.accountNumberMasked],
              ['Transfer recipient', detail.payoutAccount.hasTransferRecipient ? 'Set up' : 'Not set up'],
            ]} />
          ) : (
            <div style={{ fontSize: 12, color: T.textSec }}>{detail.isBranch ? 'See the main business.' : 'No payout account saved.'}</div>
          )}
          {(detail.payoutSummary?.length ?? 0) > 0 && (
            <div style={{ marginTop: 10 }}>
              <Rows T={T} rows={detail.payoutSummary!.map(p => [p.status, `${money(p.netAmount)} (${p.count} order${p.count === 1 ? '' : 's'})`])} />
            </div>
          )}
        </div>

        <div>
          <Head label={`Promotions (${detail.vendorPromotions?.length ?? 0})`} T={T} />
          {(detail.vendorPromotions?.length ?? 0) === 0 ? (
            <div style={{ fontSize: 12, color: T.textSec }}>None.</div>
          ) : detail.vendorPromotions!.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <Pill text={p.isActive ? 'Active' : 'Off'} tone={p.isActive ? 'good' : 'neutral'} T={T} />
              {p.approvalStatus && <Pill text={p.approvalStatus === 'PENDING' ? 'Needs review' : p.approvalStatus === 'APPROVED' ? 'Approved' : 'Rejected'} tone={p.approvalStatus === 'APPROVED' ? 'good' : p.approvalStatus === 'REJECTED' ? 'bad' : 'warn'} T={T} />}
              <span style={{ fontSize: 12, color: T.text }}>{p.title}{p.code ? ` · ${p.code}` : ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Head label="Recent orders" T={T} />
        {(detail.recentOrders?.length ?? 0) === 0 ? (
          <div style={{ fontSize: 12, color: T.textSec }}>No orders yet.</div>
        ) : (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
              <tbody>
                {detail.recentOrders!.map(o => (
                  <tr key={o.id} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, color: T.text }}>#{o.orderNumber}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: T.textSec }}>{o.customer}</td>
                    <td style={{ padding: '8px 12px' }}><Pill text={o.status.replace(/_/g, ' ')} tone={o.status === 'DELIVERED' ? 'good' : o.status === 'CANCELLED' ? 'bad' : 'neutral'} T={T} /></td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: T.text, whiteSpace: 'nowrap' }}>{money(o.totalAmount)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>{when(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detail.incidents?.length ?? 0) > 0 && (
        <div>
          <Head label={`No-response incidents (${detail.incidents!.length})`} T={T} />
          {detail.incidents!.map(i => (
            <div key={i.id} style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>{i.incidentType.replace(/_/g, ' ')} · {when(i.createdAt)}</div>
          ))}
        </div>
      )}
    </>
  );
}
