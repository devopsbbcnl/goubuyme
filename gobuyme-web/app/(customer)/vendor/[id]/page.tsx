'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface VendorDetail {
  id: string;
  businessName: string;
  slug: string;
  description?: string;
  logo?: string;
  coverImage?: string;
  category: string;
  city: string;
  state?: string;
  isOpen: boolean;
  rating?: number;
  totalRatings?: number;
  openingTime?: string;
  closingTime?: string;
  avgDeliveryTime?: number;
  verificationBadge?: string;
  commissionTier?: string;
}

interface OptionItem { id: string; name: string; extraPrice: number; isAvailable: boolean; }
interface OptionGroup { id: string; name: string; required: boolean; items: OptionItem[]; }
interface DrinkOption { id: string; name: string; price: number; isAvailable: boolean; }

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category?: string;
  isAvailable: boolean;
  isFeatured?: boolean;
  stockQuantity?: number;
  drinkOptions?: DrinkOption[];
  optionGroups?: OptionGroup[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const hasOptions = (item: MenuItem) =>
  (item.drinkOptions?.filter(d => d.isAvailable).length ?? 0) > 0 ||
  (item.optionGroups?.some(g => g.items.some(i => i.isAvailable)) ?? false);

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { addItem, items, updateQty } = useCart();
  const toast = useToast();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState('');

  // drawer state
  const [drawerItem, setDrawerItem] = useState<MenuItem | null>(null);
  const [drinkQtys, setDrinkQtys] = useState<Record<string, number>>({});
  // groupId → { itemId → qty }
  const [optionQtys, setOptionQtys] = useState<Record<string, Record<string, number>>>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    Promise.all([
      api.get(`/vendors/${id}`),
      api.get(`/vendors/${id}/menu`),
    ]).then(([vRes, mRes]) => {
      setVendor(vRes.data.data);
      setMenu(mRes.data.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const tags = [...new Set(menu.map(m => m.category).filter(Boolean))] as string[];
  const filtered = activeTag ? menu.filter(m => m.category === activeTag) : menu;
  const cartQty = (itemId: string) => items.find(i => i.menuItemId === itemId)?.qty ?? 0;

  // ── Direct add (no options) ───────────────────────────────────────────────

  const addDirect = (item: MenuItem) => {
    if (!vendor) return;
    addItem({
      id: `${vendor.id}-${item.id}`,
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      vendorId: vendor.id,
      vendorName: vendor.businessName,
    });
    toast(`${item.name} added to cart`, 'success');
  };

  // ── Drawer open / close ───────────────────────────────────────────────────

  const openDrawer = (item: MenuItem) => {
    setDrawerItem(item);
    setDrinkQtys({});
    setOptionQtys({});
    setQty(1);
  };

  const closeDrawer = () => setDrawerItem(null);

  const adjustDrinkQty = (drinkId: string, delta: number) => {
    setDrinkQtys(prev => {
      const next = (prev[drinkId] ?? 0) + delta;
      if (next <= 0) {
        const { [drinkId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [drinkId]: next };
    });
  };

  const adjustOptionQty = (groupId: string, optId: string, delta: number) => {
    setOptionQtys(prev => {
      const group = prev[groupId] ?? {};
      const next = (group[optId] ?? 0) + delta;
      if (next <= 0) {
        const { [optId]: _, ...rest } = group;
        return { ...prev, [groupId]: rest };
      }
      return { ...prev, [groupId]: { ...group, [optId]: next } };
    });
  };

  // ── Totals ────────────────────────────────────────────────────────────────

  const calcDrinkTotal = (item: MenuItem) =>
    Object.entries(drinkQtys).reduce((sum, [did, q]) => {
      const d = item.drinkOptions?.find(d => d.id === did);
      return sum + (d?.price ?? 0) * q;
    }, 0);

  const calcExtras = (item: MenuItem) => {
    let total = 0;
    for (const g of item.optionGroups ?? []) {
      const gQtys = optionQtys[g.id] ?? {};
      for (const [optId, q] of Object.entries(gQtys)) {
        const opt = g.items.find(i => i.id === optId);
        if (opt) total += opt.extraPrice * q;
      }
    }
    return total;
  };

  const drawerTotal = drawerItem
    ? (drawerItem.price + calcDrinkTotal(drawerItem) + calcExtras(drawerItem)) * qty
    : 0;

  // ── Add with options ──────────────────────────────────────────────────────

  const addWithOptions = () => {
    if (!drawerItem || !vendor) return;

    for (const group of drawerItem.optionGroups ?? []) {
      if (group.required) {
        const total = Object.values(optionQtys[group.id] ?? {}).reduce((s, q) => s + q, 0);
        if (total === 0) {
          toast(`Please select ${group.name}`, 'error');
          return;
        }
      }
    }

    const drinkPart = Object.entries(drinkQtys).sort().map(([k, v]) => `${k}x${v}`).join('|') || 'nd';
    const optPart = Object.entries(optionQtys)
      .sort()
      .flatMap(([gid, its]) => Object.entries(its).sort().map(([iid, q]) => `${gid}:${iid}x${q}`))
      .join('|') || 'no';
    const compositeId = `${vendor.id}-${drawerItem.id}-${drinkPart}-${optPart}`;

    const unitPrice = drawerItem.price + calcDrinkTotal(drawerItem) + calcExtras(drawerItem);

    const labels: string[] = [];
    Object.entries(drinkQtys).forEach(([did, q]) => {
      const d = drawerItem.drinkOptions?.find(d => d.id === did);
      if (d) labels.push(q > 1 ? `${q}x ${d.name}` : d.name);
    });
    for (const g of drawerItem.optionGroups ?? []) {
      const gQtys = optionQtys[g.id] ?? {};
      for (const [optId, q] of Object.entries(gQtys)) {
        const opt = g.items.find(i => i.id === optId);
        if (opt) labels.push(q > 1 ? `${q}x ${opt.name}` : opt.name);
      }
    }
    const displayName = labels.length ? `${drawerItem.name} (${labels.join(', ')})` : drawerItem.name;

    addItem({
      id: compositeId,
      menuItemId: compositeId,
      name: displayName,
      price: unitPrice,
      image: drawerItem.image,
      vendorId: vendor.id,
      vendorName: vendor.businessName,
    });
    if (qty > 1) updateQty(compositeId, qty);

    toast(`${drawerItem.name} added to cart`, 'success');
    closeDrawer();
  };

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) return (
    <div className="page-body">
      <div className="inner">
        <div className="sk" style={{ height: 280, marginBottom: 24 }} />
        <div className="sk" style={{ height: 40, width: 220, marginBottom: 16 }} />
        <div className="menu-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}
        </div>
      </div>
    </div>
  );

  if (!vendor) return (
    <div className="page-body">
      <div className="inner">
        <div className="empty">
          <div className="emoji">🏪</div>
          <h3>Vendor not found</h3>
        </div>
      </div>
    </div>
  );

  const hours = vendor.openingTime && vendor.closingTime
    ? `${vendor.openingTime} – ${vendor.closingTime}`
    : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Cover image */}
      <div style={{ position: 'relative', height: 280, background: 'var(--surface2)', overflow: 'hidden' }}>
        {vendor.coverImage
          ? <img src={vendor.coverImage} alt={vendor.businessName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--brand-tint), var(--surface2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>🏪</div>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 60%)' }} />
      </div>

      <div className="inner">
        {/* Vendor info card */}
        <div className="card" style={{ display: 'flex', gap: 20, padding: 24, marginTop: -40, position: 'relative', zIndex: 1, marginBottom: 32 }}>
          {vendor.logo && (
            <img src={vendor.logo} alt={vendor.businessName} style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '3px solid var(--surface)' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="between" style={{ marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>{vendor.businessName}</h1>
                {vendor.verificationBadge && vendor.verificationBadge !== 'NONE' && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--brand-tint)', color: 'var(--brand)', padding: '2px 8px', borderRadius: 'var(--r-pill)', letterSpacing: '.3px', flexShrink: 0 }}>
                    ✓ {vendor.verificationBadge.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <span className={`badge-open${vendor.isOpen ? '' : ' badge-closed'}`} style={{ flexShrink: 0 }}>
                {vendor.isOpen ? '● Open' : '● Closed'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
              <span>{vendor.city}{vendor.state ? `, ${vendor.state}` : ''}</span>
              {vendor.rating != null && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#F5A623" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  {vendor.rating.toFixed(1)}
                  {vendor.totalRatings != null && <span style={{ fontSize: 12 }}>({vendor.totalRatings.toLocaleString()})</span>}
                </span>
              )}
              {vendor.avgDeliveryTime != null && <span>{vendor.avgDeliveryTime} min delivery</span>}
              {hours && <span>{hours}</span>}
            </div>
            {vendor.description && <p className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{vendor.description}</p>}
          </div>
        </div>

        {/* Category filter chips */}
        {tags.length > 0 && (
          <div className="chip-row" style={{ marginBottom: 20 }}>
            <button className={`chip${!activeTag ? ' active' : ''}`} onClick={() => setActiveTag('')}>All</button>
            {tags.map(t => (
              <button key={t} className={`chip${activeTag === t ? ' active' : ''}`} onClick={() => setActiveTag(t)}>{t}</button>
            ))}
          </div>
        )}

        {/* Menu grid */}
        <div className="page-body" style={{ paddingTop: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="emoji">🍽️</div>
              <h3>No items</h3>
              <p>This vendor hasn't added menu items yet.</p>
            </div>
          ) : (
            <div className="menu-grid">
              {filtered.map(item => (
                <div key={item.id} className={`menu-card${!item.isAvailable ? ' unavailable' : ''}`}>
                  {item.image
                    ? <img className="img" src={item.image} alt={item.name} />
                    : <div className="img-ph">🍽️</div>
                  }
                  {item.isFeatured && <span className="menu-featured-badge">FEATURED</span>}
                  <div className="info">
                    <div className="name">{item.name}</div>
                    {item.description && (
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6, lineHeight: 1.4 }}>{item.description}</div>
                    )}
                    <div className="price">₦{item.price.toLocaleString()}</div>
                    <button
                      className="add-btn"
                      disabled={!item.isAvailable || !vendor.isOpen}
                      onClick={() => hasOptions(item) ? openDrawer(item) : addDirect(item)}
                    >
                      {!item.isAvailable
                        ? 'Unavailable'
                        : hasOptions(item)
                          ? 'Buy now'
                          : cartQty(item.id) > 0
                            ? `In cart (${cartQty(item.id)})`
                            : '+ Add to Cart'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Customisation drawer ── */}
      {drawerItem && (
        <>
          <div className="item-drawer-backdrop" onClick={closeDrawer} />
          <div className="item-drawer" role="dialog" aria-modal="true" aria-label={`Customise ${drawerItem.name}`}>

            {/* Head */}
            <div className="item-drawer-head">
              <h3 style={{ fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0 }}>{drawerItem.name}</h3>
              <button className="icon-btn" onClick={closeDrawer} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="item-drawer-body">
              {drawerItem.image && (
                <img src={drawerItem.image} alt={drawerItem.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 'var(--r)' }} />
              )}

              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand)', marginBottom: drawerItem.description ? 4 : 0 }}>
                  ₦{drawerItem.price.toLocaleString()}
                </div>
                {drawerItem.description && (
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{drawerItem.description}</p>
                )}
              </div>

              {/* Drink options — per-drink qty */}
              {(drawerItem.drinkOptions?.filter(d => d.isAvailable).length ?? 0) > 0 && (
                <div>
                  <div className="opt-group-title">
                    Choose a drink
                    <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>(optional)</span>
                  </div>
                  {drawerItem.drinkOptions!.filter(d => d.isAvailable).map(drink => {
                    const q = drinkQtys[drink.id] ?? 0;
                    return (
                      <div key={drink.id} className={`opt-item${q > 0 ? ' selected' : ''}`} style={{ cursor: 'default' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{drink.name}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', marginTop: 2 }}>+₦{drink.price.toLocaleString()}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {q > 0 && (
                            <>
                              <button className="qty-btn" onClick={() => adjustDrinkQty(drink.id, -1)} aria-label="Remove one">−</button>
                              <span className="qty-val">{q}</span>
                            </>
                          )}
                          <button className="qty-btn" onClick={() => adjustDrinkQty(drink.id, 1)} aria-label="Add one">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Option groups — per-item qty */}
              {drawerItem.optionGroups?.filter(g => g.items.some(i => i.isAvailable)).map(group => (
                <div key={group.id}>
                  <div className="opt-group-title">
                    {group.name}
                    {group.required
                      ? <span style={{ color: 'var(--error)', marginLeft: 4 }}>* required</span>
                      : <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>(optional)</span>
                    }
                  </div>
                  {group.items.filter(i => i.isAvailable).map(opt => {
                    const q = (optionQtys[group.id] ?? {})[opt.id] ?? 0;
                    return (
                      <div key={opt.id} className={`opt-item${q > 0 ? ' selected' : ''}`} style={{ cursor: 'default' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{opt.name}</div>
                          {opt.extraPrice > 0 && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', marginTop: 2 }}>+₦{opt.extraPrice.toLocaleString()}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {q > 0 && (
                            <>
                              <button className="qty-btn" onClick={() => adjustOptionQty(group.id, opt.id, -1)} aria-label="Remove one">−</button>
                              <span className="qty-val">{q}</span>
                            </>
                          )}
                          <button className="qty-btn" onClick={() => adjustOptionQty(group.id, opt.id, 1)} aria-label="Add one">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="item-drawer-foot">
              <div className="between">
                <span style={{ fontSize: 13, fontWeight: 600 }}>Quantity</span>
                <div className="qty-row">
                  <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                  <span className="qty-val">{qty}</span>
                  <button className="qty-btn" onClick={() => setQty(q => q + 1)} aria-label="Increase">+</button>
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', height: 48, fontSize: 14, fontWeight: 800 }}
                onClick={addWithOptions}
                disabled={!vendor.isOpen}
              >
                Add to Cart · ₦{drawerTotal.toLocaleString()}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
