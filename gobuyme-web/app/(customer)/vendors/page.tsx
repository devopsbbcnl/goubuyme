'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCity } from '@/context/CityContext';
import api from '@/services/api';

interface Vendor { id: string; businessName: string; category: string; city: string; logoUrl?: string; coverImageUrl?: string; averageRating?: number; isOpen: boolean; deliveryTime?: number; }

const CATEGORIES = [
  { label: 'All', slug: '' }, { label: 'Restaurants', slug: 'RESTAURANT' },
  { label: 'Groceries', slug: 'GROCERY' }, { label: 'Pharmacy', slug: 'PHARMACY' },
  { label: 'Electronics', slug: 'ELECTRONICS' }, { label: 'Fashion', slug: 'FASHION' },
  { label: 'Bakery', slug: 'BAKERY' }, { label: 'Beverages', slug: 'BEVERAGES' },
];

function VendorsContent() {
  const searchParams = useSearchParams();
  const { selectedCity } = useCity();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState(searchParams.get('category') ?? '');
  const [q, setQ] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    setCat(searchParams.get('category') ?? '');
    setQ(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cat) params.set('category', cat);
    if (q) params.set('search', q);
    if (selectedCity) params.set('city', selectedCity);
    api.get(`/vendors?${params}`).then(r => setVendors(r.data.data?.vendors ?? r.data.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [cat, q, selectedCity]);

  return (
    <div className="page-body">
      <div className="inner">
        <div className="between" style={{ marginBottom: 24 }}>
          <h1 className="t-page">
            {q ? `Results for "${q}"` : selectedCity ? `Vendors in ${selectedCity}` : 'All Vendors'}
          </h1>
          <span className="muted" style={{ fontSize: 13 }}>{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="chip-row">
          {CATEGORIES.map(c => (
            <button key={c.slug} className={`chip${cat === c.slug ? ' active' : ''}`} onClick={() => setCat(c.slug)}>{c.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="vendor-grid">
            {[...Array(12)].map((_, i) => <div key={i} className="vendor-card" style={{ pointerEvents: 'none' }}><div className="sk" style={{ height: 140, borderRadius: 0 }} /><div style={{ padding: 14 }}><div className="sk" style={{ width: 48, height: 48, borderRadius: 8, marginTop: -28, marginBottom: 8 }} /><div className="sk" style={{ height: 16, marginBottom: 8, width: '70%' }} /><div className="sk" style={{ height: 12, width: '50%' }} /></div></div>)}
          </div>
        ) : vendors.length === 0 ? (
          <div className="empty">
            <div className="emoji">🔍</div>
            <h3>{selectedCity ? `No vendors in ${selectedCity}` : 'No vendors found'}</h3>
            <p>{selectedCity ? 'Try selecting a different city from the top bar.' : 'Try a different search or category.'}</p>
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
    </div>
  );
}

export default function VendorsPage() {
  return <Suspense fallback={null}><VendorsContent /></Suspense>;
}
