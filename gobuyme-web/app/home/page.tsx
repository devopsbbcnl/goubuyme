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
  logoUrl?: string; coverImageUrl?: string; averageRating?: number;
  isOpen: boolean; deliveryTime?: number;
}
interface Promo { id: string; title: string; description?: string; imageUrl?: string; vendor: { businessName: string }; }

const HERO_SLIDES = [
  { bg: 'linear-gradient(135deg, #FF521B 0%, #FF7A4D 100%)', title: 'Hungry? GoBuyMe.', sub: 'Order food, groceries, and more — delivered in 25 minutes.', cta: 'Order Now', href: '/vendors' },
  { bg: 'linear-gradient(135deg, #1A6EFF 0%, #0077FF 100%)', title: 'Shop Anything, Anytime', sub: '500+ vendors across Nigeria ready to deliver to your door.', cta: 'Browse Vendors', href: '/vendors' },
  { bg: 'linear-gradient(135deg, #1A9E5F 0%, #22C77A 100%)', title: 'Fresh Groceries Daily', sub: 'Farm-fresh produce and household essentials delivered fast.', cta: 'Shop Groceries', href: '/vendors?category=GROCERY' },
];

const FOOD_CATEGORIES = [
  { icon: '🍚', label: 'Jollof Rice', cat: 'RESTAURANT' },
  { icon: '🍕', label: 'Pizza', cat: 'RESTAURANT' },
  { icon: '🍔', label: 'Burgers', cat: 'RESTAURANT' },
  { icon: '🍢', label: 'Suya', cat: 'RESTAURANT' },
  { icon: '🌯', label: 'Shawarma', cat: 'RESTAURANT' },
  { icon: '🍗', label: 'Chicken', cat: 'RESTAURANT' },
  { icon: '🥗', label: 'Salads', cat: 'RESTAURANT' },
  { icon: '🥤', label: 'Drinks', cat: 'BEVERAGES' },
  { icon: '🥐', label: 'Bakery', cat: 'BAKERY' },
  { icon: '🍜', label: 'Noodles', cat: 'RESTAURANT' },
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
    setDataLoading(true);
    const params = new URLSearchParams({ limit: '12' });
    if (selectedCity) params.set('city', selectedCity);

    const promoParams = new URLSearchParams();
    if (selectedCity) promoParams.set('city', selectedCity);

    Promise.all([
      api.get(`/vendors?${params}`).catch(() => ({ data: { data: [] } })),
      api.get(`/vendors/active-promotions?${promoParams}`).catch(() => ({ data: { data: [] } })),
    ]).then(([vRes, pRes]) => {
      setVendors(vRes.data.data?.vendors ?? vRes.data.data ?? []);
      setPromos(pRes.data.data ?? []);
    }).finally(() => setDataLoading(false));
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
                  <button key={c.label} onClick={() => router.push(`/vendors?q=${encodeURIComponent(c.label)}&category=${c.cat}`)}
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
                <div className="section-head"><h2 className="section-title">Deals & Promotions</h2><Link href="/vendors" className="see-all">See all</Link></div>
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
                    <Link key={v.id} href={`/vendor/${v.id}`} className="vendor-card">
                      {v.coverImageUrl ? <img className="cover" src={v.coverImageUrl} alt={v.businessName} /> : <div className="cover-ph">🏪</div>}
                      <div className="card-body">
                        {v.logoUrl && <img className="vendor-logo" src={v.logoUrl} alt="" />}
                        <div className="vendor-name">{v.businessName}</div>
                        <div className="vendor-meta">
                          {v.averageRating && <span className="rating">⭐ {v.averageRating.toFixed(1)}</span>}
                          <span>{v.city}</span>
                          {v.deliveryTime && <span>· {v.deliveryTime} min</span>}
                        </div>
                        <span className={`badge-open${v.isOpen ? '' : ' badge-closed'}`}>{v.isOpen ? 'Open' : 'Closed'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
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
