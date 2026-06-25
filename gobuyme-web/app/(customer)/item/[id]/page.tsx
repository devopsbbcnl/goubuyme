'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface OptionItem  { id: string; name: string; extraPrice: number; isAvailable: boolean; }
interface OptionGroup { id: string; name: string; required: boolean; items: OptionItem[]; }
interface DrinkOption { id: string; name: string; price: number; isAvailable: boolean; }

interface SimilarItem {
  id: string; name: string; price: number; image?: string; category?: string;
  vendor: { id: string; businessName: string; logo?: string; city: string; isOpen: boolean; isFeatured: boolean; };
}

interface ItemDetail {
  id: string; name: string; description?: string; price: number;
  image?: string; category?: string; isAvailable: boolean;
  stockQuantity?: number; isFeatured?: boolean;
  drinkOptions: DrinkOption[];
  optionGroups: OptionGroup[];
  vendor: {
    id: string; businessName: string; logo?: string; coverImage?: string;
    category: string; city: string; rating?: number; totalRatings?: number;
    isOpen: boolean; avgDeliveryTime?: number; verificationBadge?: string;
  };
}

const BADGE_LABEL: Record<string, string> = {
  ID_VERIFIED: 'ID Verified',
  BUSINESS_VERIFIED: 'Business Verified',
  PREMIUM_VERIFIED: 'Premium',
};

const hasOptions = (item: ItemDetail) =>
  item.drinkOptions.filter(d => d.isAvailable).length > 0 ||
  item.optionGroups.some(g => g.items.some(i => i.isAvailable));

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(i => {
          const filled = rating >= i;
          const half   = !filled && rating >= i - 0.5;
          return (
            <svg key={i} width="14" height="14" viewBox="0 0 24 24">
              <defs>
                <linearGradient id={`h${i}`}>
                  <stop offset="50%" stopColor="#FFD700" />
                  <stop offset="50%" stopColor="#E5E7EB" />
                </linearGradient>
              </defs>
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill={filled ? '#FFD700' : half ? `url(#h${i})` : '#E5E7EB'}
              />
            </svg>
          );
        })}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
        {rating.toFixed(1)}
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>({count} ratings)</span>
    </div>
  );
}

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { addItem, items, updateQty } = useCart();
  const toast   = useToast();

  const [item, setItem]         = useState<ItemDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty]           = useState(1);
  const [drinkQtys, setDrinkQtys]   = useState<Record<string, number>>({});
  const [optionQtys, setOptionQtys] = useState<Record<string, Record<string, number>>>({});
  const [similar, setSimilar]       = useState<SimilarItem[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  useEffect(() => {
    api.get(`/vendors/menu-items/${id}`)
      .then(r => setItem(r.data.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoadingSimilar(true);
    api.get(`/vendors/menu-items/${id}/similar`)
      .then(r => setSimilar(r.data.data ?? []))
      .catch(() => setSimilar([]))
      .finally(() => setLoadingSimilar(false));
  }, [id]);

  /* ── Loading skeleton ── */
  if (loading) return (
    <div className="page-body">
      <div className="inner" style={{ paddingTop: 28, paddingBottom: 60 }}>
        <div className="pd-grid">
          <div>
            <div className="sk" style={{ width: '100%', aspectRatio: '4/3', borderRadius: 8, marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              {[...Array(3)].map((_, i) => <div key={i} className="sk" style={{ width: 72, height: 72, borderRadius: 6 }} />)}
            </div>
          </div>
          <div>
            <div className="sk" style={{ height: 14, width: '40%', marginBottom: 14 }} />
            <div className="sk" style={{ height: 26, marginBottom: 10 }} />
            <div className="sk" style={{ height: 26, width: '70%', marginBottom: 18 }} />
            <div className="sk" style={{ height: 36, width: '45%', marginBottom: 24 }} />
            <div className="sk" style={{ height: 1, marginBottom: 24 }} />
            <div className="sk" style={{ height: 48, marginBottom: 12 }} />
            <div className="sk" style={{ height: 48 }} />
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Not found ── */
  if (notFound || !item) return (
    <div className="page-body">
      <div className="empty">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" style={{ marginBottom: 16 }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <h3>Item not found</h3>
        <p>This item may no longer be available.</p>
        <button onClick={() => router.back()} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Go Back
        </button>
      </div>
    </div>
  );

  const vendor      = item.vendor;
  const badge       = vendor.verificationBadge ? BADGE_LABEL[vendor.verificationBadge] : null;
  const canOrder    = item.isAvailable && vendor.isOpen;

  const cartEntry   = items.find(i => i.menuItemId === item.id && !i.compositeKey);
  const cartQty     = cartEntry?.quantity ?? 0;

  const drinkTotal  = item.drinkOptions.reduce((s, d) => s + (drinkQtys[d.id] ?? 0) * d.price, 0);
  const optTotal    = item.optionGroups.reduce((s, g) =>
    s + g.items.reduce((s2, i2) => s2 + (optionQtys[g.id]?.[i2.id] ?? 0) * i2.extraPrice, 0), 0);
  const unitExtra   = drinkTotal + optTotal;
  const lineTotal   = (item.price + unitExtra) * qty;

  const handleAddToCart = () => {
    if (!canOrder) return;
    const withOpts = hasOptions(item);

    if (!withOpts) {
      if (cartQty > 0) {
        updateQty(item.id, cartQty + qty);
      } else {
        addItem({ menuItemId: item.id, name: item.name, price: item.price, image: item.image, vendorId: vendor.id, vendorName: vendor.businessName });
        if (qty > 1) updateQty(item.id, qty);
      }
    } else {
      const drinkParts = item.drinkOptions.filter(d => (drinkQtys[d.id] ?? 0) > 0).map(d => `D:${d.id}x${drinkQtys[d.id]}`);
      const optParts   = item.optionGroups.flatMap(g => g.items.filter(i2 => (optionQtys[g.id]?.[i2.id] ?? 0) > 0).map(i2 => `O:${i2.id}x${optionQtys[g.id][i2.id]}`));
      const key        = [item.id, ...drinkParts, ...optParts].join('|');
      addItem({ menuItemId: item.id, name: item.name, price: item.price + unitExtra, image: item.image, vendorId: vendor.id, vendorName: vendor.businessName, compositeKey: key });
      if (qty > 1) updateQty(key, qty);
    }
    toast(`${item.name} added to cart`, 'success');
  };

  /* ── Render ── */
  return (
    <div className="page-body">
      <div className="inner" style={{ paddingTop: 20, paddingBottom: 60 }}>

        {/* Breadcrumb */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <span>/</span>
          <Link href={`/vendor/${vendor.id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--brand)'}
            onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--muted)'}
          >{vendor.businessName}</Link>
          <span>/</span>
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{item.name}</span>
        </nav>

        {/* ── Two-column grid ── */}
        <div className="pd-grid">

          {/* LEFT — Image gallery */}
          <div>
            {/* Main image */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)', position: 'relative' }}>
              {item.image
                ? <img src={item.image} alt={item.name} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'contain', display: 'block', background: '#fafafa' }} />
                : <div style={{ width: '100%', aspectRatio: '4/3', background: 'linear-gradient(135deg, var(--brand-tint), var(--surface2))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1"><path d="M3 3h18v18H3V3zm3 3v12h12V6H6zm2 2h8v2H8V8zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"/></svg>
                  </div>
              }
              {item.isFeatured && (
                <span style={{ position: 'absolute', top: 12, left: 12, background: '#FF521B', color: '#fff', fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  Featured
                </span>
              )}
            </div>

            {/* Thumbnail strip */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div className="pd-thumb active">
                {item.image
                  ? <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5"><path d="M3 3h18v18H3V3z"/></svg>
                    </div>
                }
              </div>
            </div>

            {/* Description — visible on desktop below image */}
            {item.description && (
              <div className="card" style={{ padding: 20, marginTop: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>Product Details</h3>
                <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text2)', margin: 0 }}>{item.description}</p>
              </div>
            )}
          </div>

          {/* RIGHT — Purchase panel (sticky) */}
          <div className="layout-sticky">

            {/* Sold by */}
            <Link href={`/vendor/${vendor.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              {vendor.logo
                ? <img src={vendor.logo} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} />
                : <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🏪</div>
              }
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>Sold by</span>
              <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>{vendor.businessName}</span>
              {badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand)' }}>✓ {badge}</span>}
            </Link>

            {/* Item name */}
            <h1 style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.4, marginBottom: 10, color: 'var(--text)' }}>{item.name}</h1>

            {/* Category pill */}
            {item.category && (
              <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--surface2)', color: 'var(--muted)', marginBottom: 12 }}>
                {item.category}
              </span>
            )}

            {/* Rating */}
            {vendor.rating != null && vendor.rating > 0 && (
              <div style={{ marginBottom: 14 }}>
                <StarRating rating={vendor.rating} count={vendor.totalRatings ?? 0} />
              </div>
            )}

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>
                ₦{item.price.toLocaleString()}
              </span>
              {unitExtra > 0 && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>+ ₦{unitExtra.toLocaleString()} extras</span>
              )}
            </div>

            {/* Availability badge */}
            {!item.isAvailable ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: '#FEE', color: 'var(--error)', fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15" stroke="#fff" strokeWidth="2"/><line x1="9" y1="9" x2="15" y2="15" stroke="#fff" strokeWidth="2"/></svg>
                Out of Stock
              </div>
            ) : !vendor.isOpen ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: '#FFF3E0', color: '#E65100', fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Store Currently Closed
              </div>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: '#E8F8F1', color: 'var(--success)', fontSize: 12, fontWeight: 700, marginBottom: 16 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10" fill="none" stroke="#fff" strokeWidth="2"/></svg>
                In Stock
              </div>
            )}

            <div style={{ height: 1, background: 'var(--line)', marginBottom: 18 }} />

            {/* ── Drink options ── */}
            {item.drinkOptions.filter(d => d.isAvailable).length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>Add a Drink</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {item.drinkOptions.filter(d => d.isAvailable).map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>+₦{d.price.toLocaleString()}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => setDrinkQtys(q => ({ ...q, [d.id]: Math.max(0, (q[d.id] ?? 0) - 1) }))} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{drinkQtys[d.id] ?? 0}</span>
                        <button onClick={() => setDrinkQtys(q => ({ ...q, [d.id]: (q[d.id] ?? 0) + 1 }))} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Option groups ── */}
            {item.optionGroups.filter(g => g.items.some(i2 => i2.isAvailable)).map(g => (
              <div key={g.id} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {g.name}
                  {g.required && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', padding: '2px 7px', borderRadius: 999, background: 'var(--brand-tint)' }}>Required</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.filter(i2 => i2.isAvailable).map(i2 => (
                    <div key={i2.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--r)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{i2.name}</div>
                        {i2.extraPrice > 0 && <div style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>+₦{i2.extraPrice.toLocaleString()}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => setOptionQtys(q => ({ ...q, [g.id]: { ...q[g.id], [i2.id]: Math.max(0, (q[g.id]?.[i2.id] ?? 0) - 1) } }))} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{optionQtys[g.id]?.[i2.id] ?? 0}</span>
                        <button onClick={() => setOptionQtys(q => ({ ...q, [g.id]: { ...q[g.id], [i2.id]: (q[g.id]?.[i2.id] ?? 0) + 1 } }))} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* ── Qty + CTA ── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>Quantity</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 12 }}>
                <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 42, height: 42, border: 'none', background: 'var(--surface)', cursor: 'pointer', fontSize: 20, fontFamily: 'inherit', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 700, fontSize: 15, borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)', height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{qty}</span>
                <button onClick={() => setQty(q => q + 1)} style={{ width: 42, height: 42, border: 'none', background: 'var(--surface)', cursor: 'pointer', fontSize: 20, fontFamily: 'inherit', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <button
                onClick={handleAddToCart}
                disabled={!canOrder}
                style={{ width: '100%', height: 50, border: 'none', borderRadius: 'var(--r)', background: canOrder ? 'var(--brand)' : 'var(--line)', color: canOrder ? '#fff' : 'var(--muted)', fontWeight: 800, fontSize: 15, cursor: canOrder ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'opacity .15s', letterSpacing: '.2px' }}
                onMouseEnter={e => { if (canOrder) (e.currentTarget as HTMLElement).style.opacity = '.88'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                {!canOrder
                  ? (item.isAvailable ? 'Store Closed' : 'Unavailable')
                  : `Add to Cart · ₦${lineTotal.toLocaleString()}`}
              </button>
            </div>

            {/* ── Delivery info ── */}
            <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      Delivery · {vendor.avgDeliveryTime ? `~${vendor.avgDeliveryTime} min` : 'Express'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Delivered to your location</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Secure Checkout</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Paystack-protected payment</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>From {vendor.city}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>Dispatched by {vendor.businessName}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Vendor card ── */}
            <Link href={`/vendor/${vendor.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = ''}
              >
                {vendor.logo
                  ? <img src={vendor.logo} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>🏪</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.businessName}</span>
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 999, background: vendor.isOpen ? '#E8F8F1' : '#FEE', color: vendor.isOpen ? 'var(--success)' : 'var(--error)', fontWeight: 700, flexShrink: 0 }}>
                      {vendor.isOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {vendor.rating != null && vendor.rating > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#FFD700"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {vendor.rating.toFixed(1)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{vendor.city}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--brand)', flexShrink: 0 }}>
                  View store
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ── Similar Items ── */}
        {(loadingSimilar || similar.length > 0) && (
          <section style={{ marginTop: 48 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                Similar Items You May Like
              </h2>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                From featured vendors in {item.vendor.city}
              </span>
            </div>

            {loadingSimilar ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="card" style={{ overflow: 'hidden' }}>
                    <div className="sk" style={{ width: '100%', aspectRatio: '4/3' }} />
                    <div style={{ padding: 12 }}>
                      <div className="sk" style={{ height: 14, marginBottom: 8 }} />
                      <div className="sk" style={{ height: 14, width: '60%', marginBottom: 10 }} />
                      <div className="sk" style={{ height: 18, width: '40%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {similar.map(s => (
                  <div
                    key={s.id}
                    className="card"
                    style={{ overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow .15s' }}
                    onClick={() => router.push(`/item/${s.id}`)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = ''}
                  >
                    {/* Item image */}
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: 'var(--surface2)', overflow: 'hidden' }}>
                      {s.image
                        ? <img src={s.image} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1"><path d="M3 3h18v18H3V3z"/></svg>
                          </div>
                      }
                      {/* Featured badge */}
                      <span style={{ position: 'absolute', top: 6, right: 6, background: '#FF521B', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        Featured
                      </span>
                      {/* Open/closed pill */}
                      <span style={{ position: 'absolute', bottom: 6, left: 6, background: s.vendor.isOpen ? '#E8F8F1' : '#FEE', color: s.vendor.isOpen ? 'var(--success)' : 'var(--error)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
                        {s.vendor.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '10px 12px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {s.name}
                      </div>
                      {s.category && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{s.category}</div>
                      )}
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand)', marginBottom: 8 }}>
                        ₦{s.price.toLocaleString()}
                      </div>

                      {/* Vendor strip */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                        {s.vendor.logo
                          ? <img src={s.vendor.logo} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 18, height: 18, borderRadius: 3, background: 'var(--surface2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🏪</div>
                        }
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.vendor.businessName}
                        </span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div style={{ padding: '0 12px 12px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/item/${s.id}`); }}
                        style={{ width: '100%', height: 34, border: 'none', borderRadius: 'var(--r)', background: 'var(--brand)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Buy now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
