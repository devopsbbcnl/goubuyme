'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useCity, SUPPORTED_CITIES } from '@/context/CityContext';

const VENDOR_TYPES = [
  { label: 'All', icon: '☰', slug: '' },
  { label: 'Restaurants', icon: '🍽️', slug: 'RESTAURANT' },
  { label: 'EMART', icon: '🛒', slug: 'EMART' },
  { label: 'Pharmacy', icon: '💊', slug: 'PHARMACY' },
];

type SubGroup = { label: string; icon: string; subs: string[] };
type Visual = { gradient: string; emoji: string; imageUrl?: string };
type CategoryEntry = { label: string; icon: string; subs: string[]; subGroups?: SubGroup[]; visual: Visual };

const CATEGORY_DATA: Record<string, CategoryEntry> = {
  RESTAURANT: {
    label: 'Restaurants', icon: '🍽️',
    subs: ['Jollof Rice', 'Fried Rice', 'Pepper Soup', 'Egusi Soup', 'Pounded Yam', 'Amala', 'Shawarma', 'Suya', 'Grilled Chicken', 'Burger', 'Seafood', 'Pasta', 'Puff Puff', 'Smoothies', 'Breakfast', 'Small Chops'],
    visual: { gradient: 'linear-gradient(135deg,#FF521B,#FF9A3C)', emoji: '🍽️', imageUrl: '/images/restaurant.jpg' },
  },
  EMART: {
    label: 'EMART', icon: '🛒',
    subs: ['Rice', 'Cooking Oil', 'Chicken', 'Fish', 'Noodles', 'Tomatoes', 'Milk', 'Beverages', 'Baby Food', 'Biscuits', 'Beans', 'Bread'],
    subGroups: [
      {
        label: 'Electronics & Home', icon: '📱',
        subs: ['Phone', 'Charger', 'Laptop', 'Generator', 'Blender', 'Bulb', 'Cookware', 'Cleaning'],
      },
      {
        label: 'Personal Care', icon: '🧴',
        subs: ['Body Lotion', 'Shampoo', 'Perfume', 'Toothpaste', 'Deodorant', 'Baby Diapers'],
      },
    ],
    visual: { gradient: 'linear-gradient(135deg,#27ae60,#2ecc71)', emoji: '🛒', imageUrl: '/images/grocery.jpg' },
  },
  PHARMACY: {
    label: 'Pharmacy', icon: '💊',
    subs: ['Paracetamol', 'Malaria', 'Antibiotic', 'Vitamin', 'Blood Pressure', 'Cough Syrup', 'Rehydration', 'Contraceptive', 'Eye Drops', 'Thermometer'],
    subGroups: [
      {
        label: 'Personal Hygiene', icon: '🧼',
        subs: ['Hand Sanitizer', 'Sanitary Pad', 'Antiseptic', 'Bandage', 'Face Mask'],
      },
    ],
    visual: { gradient: 'linear-gradient(135deg,#2980b9,#3498db)', emoji: '💊', imageUrl: '/images/pharmacy.jpg' },
  },
};


interface Props { showPromoBar?: boolean; promoText?: string; }

export function CustomerNav({ showPromoBar = true, promoText }: Props) {
  const { user, logout } = useAuth();
  const { totalCount } = useCart();
  const { selectedCity, setSelectedCity } = useCity();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'vendors' | 'menu_items'>('all');
  const [activeVendor, setActiveVendor] = useState('');
  const [bump, setBump] = useState(false);
  const [showPromo, setShowPromo] = useState(showPromoBar);
  const [cityOpen, setCityOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [allHoveredSub, setAllHoveredSub] = useState('RESTAURANT');
  const prevCount = useRef(totalCount);
  const [promoIdx, setPromoIdx] = useState(0);
  const cityRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PROMOS = [
    promoText ?? '🎉 Free delivery on your first order! Use code FIRST',
    '⚡ Order in 25 minutes or less — Guaranteed!',
    '🛒 500+ vendors across Nigeria — Fresh, Fast, Affordable',
  ];

  useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = totalCount;
    if (totalCount > prev) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 400);
      return () => clearTimeout(t);
    }
  }, [totalCount]);

  useEffect(() => {
    const id = setInterval(() => setPromoIdx(i => (i + 1) % PROMOS.length), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setCityOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keep search input in sync with the URL ?q= param so back/forward
  // navigation restores or clears the field automatically.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearch(q);
      const type = searchParams.get('type');
      if (type === 'vendors' || type === 'menu_items') setSearchType(type);
      else setSearchType('all');
    } else {
      setSearch('');
      setSearchType('all');
      setSearchOpen(false);
    }
  }, [searchParams]);


  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    let term = search.trim();
    if (!term) return;

    // Auto-detect a supported city in the query and strip it from the keyword
    let detectedCity: string | null = null;
    for (const city of SUPPORTED_CITIES) {
      const re = new RegExp(`\\b${city.name}\\b`, 'i');
      if (re.test(term)) {
        detectedCity = city.name;
        term = term.replace(re, '').replace(/\s+/g, ' ').trim();
        break;
      }
    }

    if (!term && detectedCity) {
      // Pure city search — show vendors in that city
      router.push(`/vendors?city=${encodeURIComponent(detectedCity)}`);
      return;
    }

    const params = new URLSearchParams({ q: term });
    if (searchType !== 'all') params.set('type', searchType);
    const cityForSearch = detectedCity ?? activeCity();
    if (cityForSearch) params.set('city', cityForSearch);
    router.push(`/vendors?${params}`);
  };

  const handleVendorCat = (slug: string) => {
    setActiveVendor(slug);
    setOpenCat(null);
    // Preserve city only — clear search query and other filters on category change
    const params = new URLSearchParams();
    if (slug) params.set('category', slug);
    const city = searchParams.get('city') ?? (selectedCity ?? '');
    if (city) params.set('city', city);
    const qs = params.toString();
    router.push(qs ? `/vendors?${qs}` : '/vendors');
  };

  const openDropdown = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenCat(key);
  };

  const closeDropdown = () => {
    closeTimer.current = setTimeout(() => setOpenCat(null), 120);
  };

  const keepOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const handleCitySelect = (city: string | null) => {
    setSelectedCity(city);
    setCityOpen(false);
    // Preserve all current params (category, q, type, page) — only swap city
    const params = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : searchParams.toString()
    );
    if (city) {
      params.set('city', city);
    } else {
      params.delete('city');
    }
    params.delete('page'); // reset to page 1 on city change
    const qs = params.toString();
    router.push(qs ? `/vendors?${qs}` : '/vendors');
  };

  // Always prefer the city in the URL; fall back to context (set by prior city selection)
  const activeCity = () => searchParams.get('city') ?? selectedCity ?? '';

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Promo bar */}
      {showPromo && (
        <div className="promo-bar">
          <div className="inner">
            <div className="row gap8" style={{ flex: 1 }}>
              <span className="promo-badge">OFFER</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {PROMOS[promoIdx]}
              </span>
            </div>
            <button className="icon-btn" style={{ color: '#fff', opacity: .7, width: 28, height: 28, flexShrink: 0 }} onClick={() => setShowPromo(false)}>✕</button>
          </div>
        </div>
      )}

      {/* Main topbar */}
      <header className={`topbar${!showPromo ? ' no-promo' : ''}`}>
        <div className="inner">
          {/* Logo */}
          <Link href="/" className="logo" style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 4, padding: '4px 10px' }}>
            <Image src="/images/logo.png" alt="GoBuyMe" width={140} height={42} style={{ objectFit: 'contain' }} />
          </Link>

          {/* City selector */}
          <div className="city-dropdown-wrap" ref={cityRef}>
            <button className="city-btn" onClick={() => setCityOpen(o => !o)} aria-label="Select city">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, color: 'var(--brand)' }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <span className="city-name">{selectedCity ?? 'All Cities'}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, transition: 'transform .2s', transform: cityOpen ? 'rotate(180deg)' : 'none' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {cityOpen && (
              <div className="city-dropdown">
                <button
                  className={`city-option${!selectedCity ? ' active' : ''}`}
                  onClick={() => handleCitySelect(null)}
                >
                  <span>All Cities</span>
                  {!selectedCity && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
                <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                {SUPPORTED_CITIES.map(city => (
                  <button
                    key={city.name}
                    className={`city-option${selectedCity === city.name ? ' active' : ''}`}
                    onClick={() => handleCitySelect(city.name)}
                  >
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      {city.name}
                      <span className="city-state"> · {city.state}</span>
                    </span>
                    {selectedCity === city.name && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <form className="search-wrap" onSubmit={handleSearch}>
            <select
              value={searchType}
              onChange={e => setSearchType(e.target.value as 'all' | 'vendors' | 'menu_items')}
              aria-label="Search type"
              style={{ flexShrink: 0, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', padding: '0 6px 0 10px', borderRight: '1px solid var(--line)', height: '100%', outline: 'none', fontFamily: 'inherit' }}
            >
              <option value="all">All</option>
              <option value="vendors">Vendors</option>
              <option value="menu_items">Items</option>
            </select>
            <input
              type="text"
              placeholder={selectedCity ? `Search in ${selectedCity}...` : 'Search vendors, food, groceries...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="search-btn" aria-label="Search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </button>
          </form>

          {/* Actions */}
          <div className="nav-actions">
            {/* Mobile search icon (hidden on desktop via .show-mobile) */}
            <button
              className="icon-btn show-mobile"
              onClick={() => { setSearchOpen(true); setMobileMenuOpen(false); }}
              aria-label="Search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </button>

            <a href="https://app.gobuyme.shop/downloads" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm nav-get-app" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round" strokeWidth="3"/></svg>
              Get App
            </a>
            <button
              className="icon-btn c-ham"
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              }
            </button>
            {user ? (
              <>
                <Link href="/notifications" className="icon-btn nav-notif" aria-label="Notifications">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </Link>
                <Link href="/cart" className="icon-btn" aria-label="Cart">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  {totalCount > 0 && <span className={`cart-badge${bump ? ' bump' : ''}`}>{totalCount}</span>}
                </Link>
                <Link href="/profile" className="nav-avatar" style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="avatar" style={{ width: 34, height: 34, fontSize: 13, ...(user.avatar ? {} : { background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }) }}>
                    {user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name ?? 'U')}
                  </div>
                </Link>
              </>
            ) : (
              <>
                <Link href="/cart" className="icon-btn" aria-label="Cart">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  {totalCount > 0 && <span className={`cart-badge${bump ? ' bump' : ''}`}>{totalCount}</span>}
                </Link>
                <Link href="/login" className="btn btn-ghost btn-sm nav-sign-in">Sign in</Link>
                <Link href="/onboarding" className="btn btn-primary btn-sm nav-register">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile search overlay */}
      {searchOpen && (
        <div className="mob-search-overlay">
          <form
            className="mob-search-form"
            onSubmit={(e) => { handleSearch(e); setSearchOpen(false); }}
          >
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSearchOpen(false)}
              aria-label="Close search"
              style={{ flexShrink: 0 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <div className="mob-search-wrap">
              <input
                type="search"
                className="mob-search-input"
                placeholder="Search vendors, food, groceries..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                autoComplete="off"
                enterKeyHint="search"
              />
              <button type="submit" className="search-btn" aria-label="Search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile nav menu */}
      {mobileMenuOpen && (
        <div className="c-mob-menu">
          <a href="https://app.gobuyme.shop/downloads" target="_blank" rel="noopener noreferrer" className="c-mob-item" onClick={() => setMobileMenuOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round" strokeWidth="3"/></svg>
            Get App
          </a>
          <div className="c-mob-divider" />
          {user ? (
            <>
              <Link href="/notifications" className="c-mob-item" onClick={() => setMobileMenuOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                Notifications
              </Link>
              <Link href="/profile" className="c-mob-item" onClick={() => setMobileMenuOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                My Profile
              </Link>
              <button className="c-mob-item danger" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="c-mob-item" onClick={() => setMobileMenuOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                Sign In
              </Link>
              <Link href="/onboarding" className="c-mob-item brand" onClick={() => setMobileMenuOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Register
              </Link>
            </>
          )}
        </div>
      )}

      {/* Category bar */}
      <nav className={`catbar${!showPromo ? ' no-promo' : ''}`}>
        <div className="inner">
          {VENDOR_TYPES.map((v) => {
            const key = v.slug === '' ? 'ALL' : v.slug;
            const isAll = v.slug === '';
            return (
              <button
                key={v.slug}
                className={`catbar-item${!isAll && activeVendor === v.slug ? ' active' : ''}${isAll ? ' catbar-all' : ''}`}
                onClick={() => handleVendorCat(v.slug)}
                onMouseEnter={() => openDropdown(key)}
                onMouseLeave={closeDropdown}
              >
                <span>{v.icon}</span>
                <span>{v.label}</span>
                {!isAll && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: .5, marginLeft: 2 }}><polyline points="6 9 12 15 18 9"/></svg>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mega / category dropdown */}
      {openCat !== null && (
        <div
          className={`nav-dropdown${!showPromo ? ' no-promo' : ''}`}
          onMouseEnter={keepOpen}
          onMouseLeave={closeDropdown}
        >
          {openCat === 'ALL' ? (
            <div className="mega-menu">
              <div className="mega-sidebar">
                {Object.entries(CATEGORY_DATA).map(([slug, cat]) => (
                  <button
                    key={slug}
                    className={`mega-side-item${allHoveredSub === slug ? ' active' : ''}`}
                    onMouseEnter={() => setAllHoveredSub(slug)}
                    onClick={() => handleVendorCat(slug)}
                  >
                    <span className="mega-side-icon">{cat.icon}</span>
                    <span>{cat.label}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto', opacity: .4 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                ))}
              </div>
              <div className="mega-panel">
                <div className="mega-panel-content">
                  <p className="mega-panel-title">{CATEGORY_DATA[allHoveredSub]?.label}</p>
                  <div className="mega-subs">
                    {CATEGORY_DATA[allHoveredSub]?.subs.map(sub => (
                      <button key={sub} className="mega-sub-item"
                        onClick={() => { const cp = activeCity() ? `&city=${encodeURIComponent(activeCity())}` : ''; router.push(`/vendors?category=${allHoveredSub}&q=${encodeURIComponent(sub)}${cp}`); setOpenCat(null); }}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                  {CATEGORY_DATA[allHoveredSub]?.subGroups?.map(group => (
                    <div key={group.label} style={{ marginTop: 20 }}>
                      <p className="mega-panel-subtitle">{group.icon} {group.label}</p>
                      <div className="mega-subs">
                        {group.subs.map(sub => (
                          <button key={sub} className="mega-sub-item"
                            onClick={() => { const cp = activeCity() ? `&city=${encodeURIComponent(activeCity())}` : ''; router.push(`/vendors?category=${allHoveredSub}&q=${encodeURIComponent(sub)}${cp}`); setOpenCat(null); }}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mega-panel-visual">
                  {CATEGORY_DATA[allHoveredSub]?.visual?.imageUrl
                    ? <Image src={CATEGORY_DATA[allHoveredSub].visual.imageUrl!} alt={CATEGORY_DATA[allHoveredSub].label} width={280} height={280} style={{ objectFit: 'contain', maxWidth: '80%', maxHeight: '80%' }} />
                    : <span className="drop-visual-emoji">{CATEGORY_DATA[allHoveredSub]?.visual?.emoji}</span>
                  }
                </div>
              </div>
            </div>
          ) : CATEGORY_DATA[openCat] ? (
            <div className="cat-dropdown">
              <div className="cat-drop-content">
                <p className="cat-drop-title">{CATEGORY_DATA[openCat].label}</p>
                <div className="cat-drop-grid">
                  {CATEGORY_DATA[openCat].subs.map(sub => (
                    <button key={sub} className="cat-drop-item"
                      onClick={() => { const cp = activeCity() ? `&city=${encodeURIComponent(activeCity())}` : ''; router.push(`/vendors?category=${openCat}&q=${encodeURIComponent(sub)}${cp}`); setOpenCat(null); }}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
                {CATEGORY_DATA[openCat].subGroups?.map(group => (
                  <div key={group.label} style={{ marginTop: 16 }}>
                    <p className="cat-drop-subtitle">{group.icon} {group.label}</p>
                    <div className="cat-drop-grid" style={{ marginTop: 8 }}>
                      {group.subs.map(sub => (
                        <button key={sub} className="cat-drop-item"
                          onClick={() => { const cp = activeCity() ? `&city=${encodeURIComponent(activeCity())}` : ''; router.push(`/vendors?category=${openCat}&q=${encodeURIComponent(sub)}${cp}`); setOpenCat(null); }}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="cat-drop-visual">
                {CATEGORY_DATA[openCat].visual.imageUrl
                  ? <Image src={CATEGORY_DATA[openCat].visual.imageUrl!} alt={CATEGORY_DATA[openCat].label} width={280} height={280} style={{ objectFit: 'contain', maxWidth: '80%', maxHeight: '80%' }} />
                  : <span className="drop-visual-emoji">{CATEGORY_DATA[openCat].visual.emoji}</span>
                }
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
