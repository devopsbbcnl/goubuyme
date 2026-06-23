'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCity } from '@/context/CityContext';
import api from '@/services/api';

interface Vendor {
  id: string; businessName: string; category: string; city: string;
  logo?: string | null; coverImage?: string | null; rating?: number;
  isOpen: boolean; avgDeliveryTime?: number | null;
}

interface MenuItem {
  id: string; name: string; description?: string | null; price: number;
  image?: string | null; category?: string | null;
  vendor: { id: string; businessName: string; logo?: string | null; city: string; isOpen: boolean; };
}

const CATEGORIES = [
  { label: 'All',          slug: '' },
  { label: 'Restaurants',  slug: 'RESTAURANT' },
  { label: 'Groceries',    slug: 'GROCERY' },
  { label: 'Pharmacy',     slug: 'PHARMACY' },
  { label: 'Home Kitchen', slug: 'HOME_KITCHEN' },
  { label: 'Beauty',       slug: 'BEAUTY' },
  { label: 'Errand',       slug: 'ERRAND' },
];

const PAGE_SIZE = 24;

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function fmtPrice(n: number) {
  return '₦' + n.toLocaleString('en-NG');
}

function MenuItemCard({ item }: { item: MenuItem }) {
  return (
    <Link href={`/vendor/${item.vendor.id}`} className="menu-card">
      {item.image
        ? <img className="img" src={item.image} alt={item.name} />
        : <div className="img-ph">🍽️</div>}
      <div className="info">
        <div className="name">{item.name}</div>
        {item.description && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </div>
        )}
        <div className="price">{fmtPrice(item.price)}</div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.vendor.logo
            ? <img src={item.vendor.logo} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
            : <span style={{ fontSize: 14 }}>🏪</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.vendor.businessName}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: item.vendor.isOpen ? '#E8F8F1' : '#FEE', color: item.vendor.isOpen ? 'var(--success)' : 'var(--error)', flexShrink: 0 }}>
            {item.vendor.isOpen ? 'Open' : 'Closed'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function VendorCard({ v }: { v: Vendor }) {
  return (
    <Link href={`/vendor/${v.id}`} className="vendor-card">
      {v.coverImage ? <img className="cover" src={v.coverImage} alt={v.businessName} /> : <div className="cover-ph">🏪</div>}
      <div className="card-body">
        {v.logo && <img className="vendor-logo" src={v.logo} alt="" />}
        <div className="vendor-name">{v.businessName}</div>
        <div className="vendor-meta">
          <span className="rating">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFD700" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {v.rating != null ? v.rating.toFixed(1) : '0.0'}
          </span>
          <span>{v.city}</span>
          {v.avgDeliveryTime && <span>· {v.avgDeliveryTime} min</span>}
        </div>
        <span className={`badge-open${v.isOpen ? '' : ' badge-closed'}`}>{v.isOpen ? 'Open' : 'Closed'}</span>
      </div>
    </Link>
  );
}

function VendorsContent() {
  const searchParams = useSearchParams();
  const { selectedCity } = useCity();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination (browse mode only)
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalVendors, setTotalVendors] = useState(0);

  // Derived from URL params
  const [cat, setCat] = useState(searchParams.get('category') ?? '');
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [searchType, setSearchType] = useState(searchParams.get('type') ?? 'all');
  const [urlCity, setUrlCity] = useState<string | null>(searchParams.get('city'));

  const [activeTab, setActiveTab] = useState<'vendors' | 'menu_items'>('vendors');

  // Sync all URL-derived state in one pass; reset page to 1 on any filter change
  useEffect(() => {
    setCat(searchParams.get('category') ?? '');
    setQ(searchParams.get('q') ?? '');
    setSearchType(searchParams.get('type') ?? 'all');
    setUrlCity(searchParams.get('city'));
    setPage(1);
  }, [searchParams]);

  // Scroll to top when page changes
  useEffect(() => {
    if (page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // Fetch — only depends on derived state, not on searchParams directly
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const effectiveCity = urlCity ?? selectedCity;

    if (q) {
      // Search mode — no client pagination (API returns up to 30 vendors / 60 items)
      const params = new URLSearchParams({ q });
      if (searchType !== 'all') params.set('type', searchType);
      if (cat) params.set('category', cat);
      if (effectiveCity) params.set('city', effectiveCity);

      api.get(`/vendors/search?${params}`)
        .then(r => {
          if (cancelled) return;
          const data = r.data.data ?? {};
          const v: Vendor[] = data.vendors ?? [];
          const m: MenuItem[] = data.menuItems ?? [];
          setVendors(v);
          setMenuItems(m);
          setTotalVendors(v.length);
          setTotalPages(1);
          if (searchType === 'menu_items') setActiveTab('menu_items');
          else if (searchType === 'vendors') setActiveTab('vendors');
          else setActiveTab(v.length > 0 ? 'vendors' : 'menu_items');
        })
        .catch(() => { if (!cancelled) { setVendors([]); setMenuItems([]); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      // Browse mode — paginated
      setMenuItems([]);
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (cat) params.set('category', cat);
      if (effectiveCity) params.set('city', effectiveCity);

      api.get(`/vendors?${params}`)
        .then(r => {
          if (cancelled) return;
          setVendors(r.data.data ?? []);
          setTotalPages(r.data.pagination?.totalPages ?? 1);
          setTotalVendors(r.data.pagination?.total ?? 0);
        })
        .catch(() => { if (!cancelled) setVendors([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }

    return () => { cancelled = true; };
  }, [cat, q, searchType, urlCity, selectedCity, page]);

  const isSearchMode = Boolean(q);
  const showTabs = isSearchMode && searchType === 'all';

  const showingItems =
    (isSearchMode && searchType === 'menu_items') ||
    (showTabs && activeTab === 'menu_items');

  const activeCount = showTabs
    ? (activeTab === 'vendors' ? vendors.length : menuItems.length)
    : showingItems
      ? menuItems.length
      : isSearchMode ? vendors.length : totalVendors;

  const skeletonIsItems = searchType === 'menu_items' || (showTabs && activeTab === 'menu_items');
  const emptyLabel = showingItems ? 'items' : 'vendors';

  const pageNums = getPageNumbers(page, totalPages);

  return (
    <div className="page-body">
      <div className="inner">
        <div className="between" style={{ marginBottom: 24 }}>
          <h1 className="t-page">
            {q
              ? `Results for "${q}"${urlCity ? ` in ${urlCity}` : selectedCity ? ` in ${selectedCity}` : ''}`
              : selectedCity ? `Vendors in ${selectedCity}` : 'All Vendors'}
          </h1>
          {!loading && (
            <span className="muted" style={{ fontSize: 13 }}>
              {isSearchMode
                ? `${activeCount} ${showingItems ? `item${activeCount !== 1 ? 's' : ''}` : `vendor${activeCount !== 1 ? 's' : ''}`}`
                : `${totalVendors.toLocaleString()} vendor${totalVendors !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        <div className="chip-row">
          {CATEGORIES.map(c => (
            <button
              key={c.slug}
              className={`chip${cat === c.slug ? ' active' : ''}`}
              onClick={() => { setCat(c.slug); setPage(1); }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Tabs — only for type=all searches */}
        {showTabs && (
          <div style={{ display: 'flex', marginBottom: 24, borderBottom: '2px solid var(--line)' }}>
            {(['vendors', 'menu_items'] as const).map(tab => {
              const count = tab === 'vendors' ? vendors.length : menuItems.length;
              const label = tab === 'vendors' ? 'Vendors' : 'Menu Items';
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    color: isActive ? 'var(--brand)' : 'var(--text2)',
                    borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                    marginBottom: -2, transition: 'color .15s',
                  }}
                >
                  {label}
                  {!loading && (
                    <span style={{
                      marginLeft: 6, fontSize: 12, fontWeight: 500, padding: '1px 6px', borderRadius: 999,
                      background: isActive ? 'var(--brand-tint)' : 'var(--surface2)',
                      color: isActive ? 'var(--brand)' : 'var(--text2)',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className={skeletonIsItems ? 'menu-grid' : 'vendor-grid'}>
            {[...Array(PAGE_SIZE)].map((_, i) =>
              skeletonIsItems ? (
                <div key={i} className="menu-card" style={{ pointerEvents: 'none' }}>
                  <div className="sk" style={{ height: 130 }} />
                  <div style={{ padding: 12 }}>
                    <div className="sk" style={{ height: 14, marginBottom: 8, width: '80%' }} />
                    <div className="sk" style={{ height: 16, width: '40%', marginBottom: 12 }} />
                    <div className="sk" style={{ height: 32 }} />
                  </div>
                </div>
              ) : (
                <div key={i} className="vendor-card" style={{ pointerEvents: 'none' }}>
                  <div className="sk" style={{ height: 140, borderRadius: 0 }} />
                  <div style={{ padding: 14 }}>
                    <div className="sk" style={{ width: 48, height: 48, borderRadius: 8, marginTop: -28, marginBottom: 8 }} />
                    <div className="sk" style={{ height: 16, marginBottom: 8, width: '70%' }} />
                    <div className="sk" style={{ height: 12, width: '50%' }} />
                  </div>
                </div>
              )
            )}
          </div>
        ) : activeCount === 0 ? (
          <div className="empty">
            <div className="emoji">🔍</div>
            <h3>
              {isSearchMode
                ? `No ${emptyLabel} found for "${q}"`
                : selectedCity ? `No vendors in ${selectedCity}` : 'No vendors found'}
            </h3>
            <p>
              {isSearchMode
                ? showTabs
                  ? 'Try switching tabs or use a different keyword.'
                  : 'Try a different keyword or remove the city filter.'
                : selectedCity
                  ? 'Try selecting a different city from the top bar.'
                  : 'Try a different search or category.'}
            </p>
          </div>
        ) : showingItems ? (
          <div className="menu-grid">
            {menuItems.map(item => <MenuItemCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="vendor-grid">
            {vendors.map(v => <VendorCard key={v.id} v={v} />)}
          </div>
        )}

        {/* Pagination — browse mode only */}
        {!isSearchMode && !loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 40, flexWrap: 'wrap' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, fontWeight: 600, fontSize: 13, fontFamily: 'inherit', transition: 'opacity .15s' }}
            >
              ← Prev
            </button>

            {pageNums.map((p, i) =>
              p === '...'
                ? <span key={`ellipsis-${i}`} style={{ padding: '0 6px', color: 'var(--muted)', fontSize: 14 }}>…</span>
                : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    style={{
                      width: 36, height: 36, borderRadius: 4, border: '1px solid',
                      borderColor: page === p ? 'var(--brand)' : 'var(--line)',
                      background: page === p ? 'var(--brand)' : 'var(--surface)',
                      color: page === p ? '#fff' : 'var(--text)',
                      cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', transition: 'all .15s',
                    }}
                  >
                    {p}
                  </button>
                )
            )}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, fontWeight: 600, fontSize: 13, fontFamily: 'inherit', transition: 'opacity .15s' }}
            >
              Next →
            </button>

            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, totalVendors).toLocaleString()} of {totalVendors.toLocaleString()}
            </span>
          </div>
        )}

      </div>
    </div>
  );
}

export default function VendorsPage() {
  return <Suspense fallback={null}><VendorsContent /></Suspense>;
}
