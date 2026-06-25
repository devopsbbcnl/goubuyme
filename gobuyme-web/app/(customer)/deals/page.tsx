'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCity } from '@/context/CityContext';
import api from '@/services/api';

interface PromoVendor {
  id: string;
  businessName: string;
  logo?: string | null;
  coverImage?: string | null;
  category: string;
  city: string;
  rating?: number | null;
  isOpen: boolean;
  verificationBadge?: string;
}

interface Promo {
  id: string;
  title: string;
  imageUrl?: string | null;
  code?: string | null;
  vendor: PromoVendor;
}

const BADGE_LABEL: Record<string, string> = {
  ID_VERIFIED: 'ID Verified',
  BUSINESS_VERIFIED: 'Business Verified',
  PREMIUM_VERIFIED: 'Premium',
};

function PromoCard({ promo }: { promo: Promo }) {
  const { vendor } = promo;
  const badge = vendor.verificationBadge ? BADGE_LABEL[vendor.verificationBadge] : null;

  return (
    <Link href={`/vendor/${vendor.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ overflow: 'hidden', transition: 'transform .15s, box-shadow .15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.12)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
      >
        {/* Promo banner */}
        <div style={{ position: 'relative' }}>
          {promo.imageUrl
            ? <img src={promo.imageUrl} alt={promo.title} style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', height: 170, background: 'linear-gradient(135deg, var(--brand-tint), var(--surface2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>🎁</div>
          }
          {promo.code && (
            <span style={{
              position: 'absolute', bottom: 10, left: 10,
              background: '#FF521B', color: '#fff', fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 999, letterSpacing: '.5px',
            }}>
              USE {promo.code}
            </span>
          )}
        </div>

        <div style={{ padding: '14px 14px 16px' }}>
          {/* Promo title */}
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, lineHeight: 1.4 }}>{promo.title}</div>

          {/* Vendor row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            {vendor.logo
              ? <img src={vendor.logo} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏪</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {vendor.businessName}
                </span>
                {badge && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand)', flexShrink: 0 }}>
                    ✓ {badge}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                {vendor.rating != null && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFD700"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    {vendor.rating.toFixed(1)}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{vendor.city}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, marginLeft: 'auto',
                  background: vendor.isOpen ? '#E8F8F1' : '#FEE', color: vendor.isOpen ? 'var(--success)' : 'var(--error)',
                }}>
                  {vendor.isOpen ? 'Open' : 'Closed'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function DealsContent() {
  const searchParams = useSearchParams();
  const { selectedCity } = useCity();
  const urlCity = searchParams.get('city');
  const cityLabel = urlCity ?? selectedCity;

  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({ limit: '100' });
    if (cityLabel) params.set('city', cityLabel);

    api.get(`/vendors/active-promotions?${params}`)
      .then(r => { if (!cancelled) setPromos(r.data.data ?? []); })
      .catch(() => { if (!cancelled) setPromos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [cityLabel]);

  const title = cityLabel ? `Deals & Promotions in ${cityLabel}` : 'Deals & Promotions';

  return (
    <div className="page-body">
      <div className="inner">
        <div style={{ marginTop: 32, marginBottom: 20, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h1>
          {!loading && (
            <span className="muted" style={{ fontSize: 13 }}>
              {promos.length} deal{promos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="card" style={{ overflow: 'hidden' }}>
                <div className="sk" style={{ height: 170, borderRadius: 0 }} />
                <div style={{ padding: 14 }}>
                  <div className="sk" style={{ height: 14, marginBottom: 10, width: '80%' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                    <div className="sk" style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="sk" style={{ height: 13, marginBottom: 6, width: '60%' }} />
                      <div className="sk" style={{ height: 11, width: '40%' }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : promos.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎁</div>
            <h3>{cityLabel ? `No active deals in ${cityLabel}` : 'No active deals right now'}</h3>
            <p style={{ marginBottom: 20 }}>
              {cityLabel ? 'Vendors in this city haven\'t posted any promotions yet.' : 'Check back soon — vendors post new deals regularly!'}
            </p>
            <Link href="/vendors" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--brand)', color: '#fff', borderRadius: 4, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
              Browse Vendors
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {promos.map(p => <PromoCard key={p.id} promo={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DealsPage() {
  return <Suspense fallback={null}><DealsContent /></Suspense>;
}
