'use client';

// /home is the main customer browsing page - wrapped by (customer) layout via redirect from root
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCity } from '@/context/CityContext';
import { CustomerNav } from '@/components/layout/CustomerNav';
import { CustomerFooter } from '@/components/layout/CustomerFooter';
import api from '@/services/api';

interface Vendor {
  id: string; businessName: string; category: string; city: string;
  logo?: string | null; coverImage?: string | null; rating?: number;
  isOpen: boolean; avgDeliveryTime?: number | null;
  isFeatured?: boolean; verificationBadge?: string;
}
interface Promo { id: string; title: string; description?: string; imageUrl?: string; vendor: { businessName: string }; }

const HERO_SLIDES = [
  { bg: 'linear-gradient(135deg, #FF521B 0%, #FF7A4D 100%)', title: 'Hungry? GoBuyMe.', sub: 'Order food, groceries, and more — delivered in 25 minutes.', cta: 'Order Now', href: '/vendors' },
  { bg: 'linear-gradient(135deg, #1A6EFF 0%, #0077FF 100%)', title: 'Shop Anything, Anytime', sub: '500+ vendors across Nigeria ready to deliver to your door.', cta: 'Browse Vendors', href: '/vendors' },
  { bg: 'linear-gradient(135deg, #1A9E5F 0%, #22C77A 100%)', title: 'Shop at EMART', sub: 'Groceries, household essentials, and more — delivered fast.', cta: 'Shop EMART', href: '/vendors?category=EMART' },
];

const FOOD_CATEGORIES = [
  { icon: '🍚', label: 'Jollof Rice',   cat: 'RESTAURANT' },
  { icon: '🍕', label: 'Pizza',         cat: 'RESTAURANT' },
  { icon: '🍔', label: 'Burgers',       cat: 'RESTAURANT' },
  { icon: '🍢', label: 'Suya',          cat: 'RESTAURANT' },
  { icon: '🌯', label: 'Shawarma',      cat: 'RESTAURANT' },
  { icon: '🍗', label: 'Chicken',       cat: 'RESTAURANT' },
  { icon: '🥗', label: 'Salads',        cat: 'RESTAURANT' },
  { icon: '🛒', label: 'EMART',         cat: 'EMART' },
  { icon: '🥐', label: 'Bakery',        cat: 'RESTAURANT' },
  { icon: '💊', label: 'Pharmacy',      cat: 'PHARMACY' },
];

export default function HomePage() {
  const { user, loading } = useAuth();
  const { selectedCity } = useCity();
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && user) {
      if (user.role === 'vendor') { router.replace('/vendor'); return; }
      if (user.role === 'rider') { router.replace('/rider'); return; }
    }
  }, [user, loading, router]);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    const params = new URLSearchParams({ limit: '12' });
    if (selectedCity) params.set('city', selectedCity);

    const promoParams = new URLSearchParams();
    if (selectedCity) promoParams.set('city', selectedCity);

    Promise.all([
      api.get(`/vendors?${params}`).catch(() => ({ data: { data: [] } })),
      api.get(`/vendors/active-promotions?${promoParams}`).catch(() => ({ data: { data: [] } })),
    ]).then(([vRes, pRes]) => {
      if (cancelled) return;
      setVendors(vRes.data.data?.vendors ?? vRes.data.data ?? []);
      setPromos(pRes.data.data ?? []);
    }).finally(() => { if (!cancelled) setDataLoading(false); });

    return () => { cancelled = true; };
  }, [selectedCity]);

  useEffect(() => {
    autoRef.current = setInterval(() => setSlide(s => (s + 1) % HERO_SLIDES.length), 5000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, []);

  if (loading) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CustomerNav />
      <main style={{ flex: 1 }}>
        <div className="page-body">

          {/* ── HERO ── full-width, outside .inner */}
          <div className="hero">
            <div className="hero-track" style={{ position: 'relative' }}>
              <div className="hero-slide" style={{ background: HERO_SLIDES[slide].bg }}>
                <div className="hero-overlay">
                  <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', opacity: .7, marginBottom: 10 }}>GoBuyMe · Nigeria's #1 Delivery App</p>
                  <h2>{HERO_SLIDES[slide].title}</h2>
                  <p>{HERO_SLIDES[slide].sub}</p>
                  <Link href={HERO_SLIDES[slide].href} className="btn" style={{ width: 'fit-content', background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.8)', color: '#fff', backdropFilter: 'blur(4px)', height: 44, padding: '0 24px', fontWeight: 700, borderRadius: 'var(--r)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {HERO_SLIDES[slide].cta} →
                  </Link>
                </div>
              </div>
              <button className="hero-btn prev" onClick={() => setSlide(s => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)} aria-label="Previous">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button className="hero-btn next" onClick={() => setSlide(s => (s + 1) % HERO_SLIDES.length)} aria-label="Next">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="hero-dots">
              {HERO_SLIDES.map((_, i) => <button key={i} className={`hero-dot${i === slide ? ' active' : ''}`} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} />)}
            </div>
          </div>

          <div className="inner">

            {/* ── FOOD CATEGORIES ── */}
            <div className="section">
              <div className="section-head"><h2 className="section-title">What are you craving?</h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 12 }}>
                {FOOD_CATEGORIES.map(c => (
                  <button key={c.label} onClick={() => { const cp = selectedCity ? `&city=${encodeURIComponent(selectedCity)}` : ''; router.push(`/vendors?q=${encodeURIComponent(c.label)}&category=${c.cat}${cp}`); }}
                    className="card card-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 8px', cursor: 'pointer', transition: 'all .15s', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)'; (e.currentTarget as HTMLElement).style.color = 'var(--brand)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; }}
                  >
                    <span style={{ fontSize: 28 }}>{c.icon}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── PROMOS ── */}
            {promos.length > 0 && (
              <div className="section">
                <div className="section-head"><h2 className="section-title">Deals & Promotions</h2><Link href={selectedCity ? `/deals?city=${encodeURIComponent(selectedCity)}` : '/deals'} className="see-all">See all</Link></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                  {promos.slice(0, 4).map(p => (
                    <div key={p.id} className="card" style={{ overflow: 'hidden' }}>
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.title} style={{ width: '100%', height: 160, objectFit: 'cover' }} /> : <div style={{ width: '100%', height: 160, background: 'linear-gradient(135deg, var(--brand-tint), var(--surface2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🎁</div>}
                      <div style={{ padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.title}</div>
                        {p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>by {p.vendor.businessName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── VENDORS ── */}
            <div className="section">
              <div className="section-head">
                <h2 className="section-title">
                  {selectedCity ? `Vendors in ${selectedCity}` : 'Vendors near you'}
                </h2>
                <Link href={selectedCity ? `/vendors?city=${encodeURIComponent(selectedCity)}` : '/vendors'} className="see-all">Browse all →</Link>
              </div>
              {dataLoading ? (
                <div className="vendor-grid">
                  {[...Array(8)].map((_, i) => <div key={i} className="vendor-card" style={{ pointerEvents: 'none' }}><div className="sk" style={{ height: 140, borderRadius: 0 }} /><div style={{ padding: 14 }}><div className="sk" style={{ width: 48, height: 48, borderRadius: 8, marginTop: -28, marginBottom: 8 }} /><div className="sk" style={{ height: 16, marginBottom: 8, width: '70%' }} /><div className="sk" style={{ height: 12, width: '50%' }} /></div></div>)}
                </div>
              ) : vendors.length === 0 ? (
                <div className="empty">
                  <div className="emoji">🏙️</div>
                  <h3>{selectedCity ? `No vendors in ${selectedCity} yet` : 'No vendors yet'}</h3>
                  <p>{selectedCity ? 'Try a different city or check back soon!' : "We're expanding to your area soon!"}</p>
                </div>
              ) : (
                <div className="vendor-grid">
                  {vendors.map(v => (
                    <Link key={v.id} href={`/vendor/${v.id}`} className="vendor-card" style={{ position: 'relative' }}>
                      {v.isFeatured && (
                        <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: '#FF521B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.6px' }}>Featured</span>
                      )}
                      {v.coverImage ? <img className="cover" src={v.coverImage} alt={v.businessName} /> : <div className="cover-ph">🏪</div>}
                      <div className="card-body">
                        {v.logo && <img className="vendor-logo" src={v.logo} alt="" />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <div className="vendor-name" style={{ flex: 1 }}>{v.businessName}</div>
                          {v.verificationBadge && v.verificationBadge !== 'UNVERIFIED' && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand)', flexShrink: 0 }}>✓ Verified</span>
                          )}
                        </div>
                        <div className="vendor-meta">
                          <span className="rating"><svg width="12" height="12" viewBox="0 0 24 24" fill="#FFD700" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>{v.rating != null ? v.rating.toFixed(1) : '0.0'}</span>
                          <span>{v.city}</span>
                          {v.avgDeliveryTime && <span>· {v.avgDeliveryTime} min</span>}
                        </div>
                        <span className={`badge-open${v.isOpen ? '' : ' badge-closed'}`}>{v.isOpen ? 'Open' : 'Closed'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* ── DOWNLOAD APP ── */}
            <div className="section">
              <div style={{ background: 'linear-gradient(135deg, #FF521B 0%, #FF7A4D 100%)', borderRadius: 4, padding: '40px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ color: '#fff' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', opacity: .8, marginBottom: 8 }}>Mobile App</p>
                  <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10, lineHeight: 1.2 }}>Order faster with our app</h2>
                  <p style={{ fontSize: 15, opacity: .9, maxWidth: 380, lineHeight: 1.6, marginBottom: 0 }}>Track your delivery in real-time, save addresses, and get exclusive app-only deals. Download now and get free delivery on your first order.</p>
                </div>
                <a href="https://app.gobuyme.shop/downloads" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 28px', borderRadius: 4, textDecoration: 'none', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,.15)', transition: 'transform .15s, box-shadow .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.15)'; }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round" strokeWidth="3"/></svg>
                  Download the App
                </a>
              </div>
            </div>

            {/* ── TRUST ── */}
            <div className="section">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {[['⚡', '25-Min Delivery', 'Lightning-fast delivery guaranteed'], ['🔒', 'Secure Payments', 'Paystack-powered, 100% safe'], ['⭐', '500+ Vendors', 'Quality stores across Nigeria'], ['📞', '24/7 Support', 'Always here when you need us']].map(([icon, title, sub]) => (
                  <div key={title} className="card card-pad" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>{/* /.inner */}
        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
