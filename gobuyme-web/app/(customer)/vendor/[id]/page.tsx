'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';

interface VendorDetail {
  id: string; businessName: string; category: string; city: string; address: string;
  logoUrl?: string; coverImageUrl?: string; averageRating?: number;
  isOpen: boolean; deliveryTime?: number; bio?: string;
}
interface MenuItem {
  id: string; name: string; description?: string; price: number;
  imageUrl?: string; isAvailable: boolean; categoryTag?: string;
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { addItem, items } = useCart();
  const toast = useToast();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/vendors/${id}`),
      api.get(`/vendors/${id}/menu`),
    ]).then(([vRes, mRes]) => {
      setVendor(vRes.data.data);
      setMenu(mRes.data.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const tags = [...new Set(menu.map(m => m.categoryTag).filter(Boolean))] as string[];
  const filtered = activeTag ? menu.filter(m => m.categoryTag === activeTag) : menu;

  const cartQty = (itemId: string) => items.find(i => i.menuItemId === itemId)?.qty ?? 0;

  const add = (item: MenuItem) => {
    if (!vendor) return;
    addItem({ id: `${vendor.id}-${item.id}`, menuItemId: item.id, name: item.name, price: item.price, image: item.imageUrl, vendorId: vendor.id, vendorName: vendor.businessName });
    toast(`${item.name} added to cart`, 'success');
  };

  if (loading) return (
    <div className="page-body"><div className="inner">
      <div className="sk" style={{ height: 280, marginBottom: 24 }} />
      <div className="sk" style={{ height: 40, width: 200, marginBottom: 16 }} />
      <div className="menu-grid">{[...Array(6)].map((_, i) => <div key={i} className="sk" style={{ height: 200 }} />)}</div>
    </div></div>
  );

  if (!vendor) return <div className="page-body"><div className="inner"><div className="empty"><div className="emoji">🏪</div><h3>Vendor not found</h3></div></div></div>;

  return (
    <div>
      {/* Cover */}
      <div style={{ position: 'relative', height: 280, background: 'var(--surface2)', overflow: 'hidden' }}>
        {vendor.coverImageUrl
          ? <img src={vendor.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--brand-tint), var(--surface2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>🏪</div>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 60%)' }} />
      </div>

      <div className="inner">
        {/* Vendor info */}
        <div className="card" style={{ display: 'flex', gap: 20, padding: 24, marginTop: -40, position: 'relative', zIndex: 1, marginBottom: 32 }}>
          {vendor.logoUrl && <img src={vendor.logoUrl} alt="" style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '3px solid var(--surface)' }} />}
          <div style={{ flex: 1 }}>
            <div className="between" style={{ marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800 }}>{vendor.businessName}</h1>
              <span className={`badge-open${vendor.isOpen ? '' : ' badge-closed'}`}>{vendor.isOpen ? '🟢 Open' : '🔴 Closed'}</span>
            </div>
            <div className="row gap16 muted" style={{ fontSize: 13, flexWrap: 'wrap' }}>
              <span>{vendor.city}</span>
              {vendor.averageRating && <span>⭐ {vendor.averageRating.toFixed(1)}</span>}
              {vendor.deliveryTime && <span>⏱ {vendor.deliveryTime} min</span>}
              <span>📍 {vendor.address}</span>
            </div>
            {vendor.bio && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{vendor.bio}</p>}
          </div>
        </div>

        {/* Category filter */}
        {tags.length > 0 && (
          <div className="chip-row">
            <button className={`chip${!activeTag ? ' active' : ''}`} onClick={() => setActiveTag('')}>All</button>
            {tags.map(t => <button key={t} className={`chip${activeTag === t ? ' active' : ''}`} onClick={() => setActiveTag(t)}>{t}</button>)}
          </div>
        )}

        {/* Menu */}
        <div className="page-body" style={{ paddingTop: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty"><div className="emoji">🍽️</div><h3>No items</h3><p>This vendor hasn't added menu items yet.</p></div>
          ) : (
            <div className="menu-grid">
              {filtered.map(item => (
                <div key={item.id} className="menu-card">
                  {item.imageUrl ? <img className="img" src={item.imageUrl} alt={item.name} /> : <div className="img-ph">🍽️</div>}
                  <div className="info">
                    <div className="name">{item.name}</div>
                    {item.description && <div className="muted" style={{ fontSize: 12, marginBottom: 6, lineHeight: 1.4 }}>{item.description}</div>}
                    <div className="price">₦{item.price.toLocaleString()}</div>
                    <button className="add-btn" onClick={() => add(item)} disabled={!item.isAvailable || !vendor.isOpen}>
                      {cartQty(item.id) > 0 ? `In cart (${cartQty(item.id)})` : '+ Add to Cart'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
