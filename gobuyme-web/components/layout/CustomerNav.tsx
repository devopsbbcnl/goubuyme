'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useCity, SUPPORTED_CITIES } from '@/context/CityContext';

const VENDOR_TYPES = [
  { label: 'All', icon: '☰', slug: '' },
  { label: 'Restaurants', icon: '🍽️', slug: 'RESTAURANT' },
  { label: 'Groceries', icon: '🛒', slug: 'GROCERY' },
  { label: 'Drinks', icon: '🥤', slug: 'DRINKS' },
  { label: 'Pharmacy', icon: '💊', slug: 'PHARMACY' },
  { label: 'Electronics', icon: '📱', slug: 'ELECTRONICS' },
  { label: 'Home & Kitchen', icon: '🏠', slug: 'HOME_KITCHEN' },
  { label: 'Baby & Toys', icon: '🧸', slug: 'BABY_KIDS' },
  { label: 'Pets', icon: '🐾', slug: 'PETS' },
];

type SubGroup = { label: string; icon: string; subs: string[] };
type Visual = { gradient: string; emoji: string; imageUrl?: string };
type CategoryEntry = { label: string; icon: string; subs: string[]; subGroups?: SubGroup[]; visual: Visual };

// TODO: replace with real subcategories from backend once category taxonomy is finalised
// TODO: swap visual.gradient + visual.emoji for real image URLs when assets are ready
const CATEGORY_DATA: Record<string, CategoryEntry> = {
  RESTAURANT: {
    label: 'Restaurants', icon: '🍽️',
    subs: ['Fast Food', 'Local Cuisine', 'Chinese', 'Pizza & Italian', 'Grills & BBQ', 'Vegetarian', 'Seafood', 'Soups & Stews', 'Shawarma & Wraps', 'Pastries & Desserts'],
    visual: { gradient: 'linear-gradient(135deg,#FF521B,#FF9A3C)', emoji: '🍽️', imageUrl: '/images/restaurant.jpg' },
  },
  GROCERY: {
    label: 'Groceries', icon: '🛒',
    subs: ['Fresh Produce', 'Dairy & Eggs', 'Meat & Poultry', 'Seafood', 'Snacks', 'Grains & Staples', 'Cooking Essentials', 'Frozen Foods', 'Organic'],
    visual: { gradient: 'linear-gradient(135deg,#1A9E5F,#4DD68C)', emoji: '🛒', imageUrl: '/images/grocery.jpg' },
  },
  DRINKS: {
    label: 'Drinks', icon: '🥤',
    subs: ['Water & Juices', 'Soft Drinks', 'Energy Drinks', 'Beer & Cider', 'Wine & Spirits', 'Smoothies', 'Tea & Coffee', 'Milk & Dairy Drinks'],
    visual: { gradient: 'linear-gradient(135deg,#0077FF,#00C2FF)', emoji: '🥤', imageUrl: '/images/drinks.jpg' },
  },
  PHARMACY: {
    label: 'Pharmacy', icon: '💊',
    subs: ['Over-the-Counter', 'Vitamins & Supplements', 'Baby & Maternal', 'Medical Devices', 'Eye Care', 'Dental Care', 'First Aid'],
    subGroups: [
      {
        label: 'Beauty & Health', icon: '💄',
        subs: ['Skincare', 'Haircare', 'Makeup', 'Fragrances', 'Nail Care', "Men's Grooming", 'Fitness & Nutrition', 'Wellness'],
      },
      {
        label: 'Sex & Lifestyle', icon: '🌹',
        subs: ['Contraceptives', 'Sexual Wellness', 'Lubricants', 'Supplements', 'Massage & Relaxation', 'Intimate Care'],
      },
    ],
    visual: { gradient: 'linear-gradient(135deg,#5B6EF5,#9B59F5)', emoji: '💊', imageUrl: '/images/pharmacy.jpg' },
  },
  ELECTRONICS: {
    label: 'Electronics', icon: '📱',
    subs: ['Phones & Tablets', 'Laptops & Computers', 'TV & Audio', 'Cameras', 'Gaming', 'Smart Devices', 'Accessories', 'Power & Cables'],
    visual: { gradient: 'linear-gradient(135deg,#1A1A2E,#16213E)', emoji: '📱', imageUrl: '/images/electronics.jpg' },
  },
  HOME_KITCHEN: {
    label: 'Home & Kitchen', icon: '🏠',
    subs: ['Furniture', 'Kitchenware', 'Bedding & Linen', 'Home Decor', 'Cleaning Supplies', 'Storage & Organisation', 'Lighting', 'Tools & Hardware'],
    visual: { gradient: 'linear-gradient(135deg,#C4783A,#E8A96A)', emoji: '🏠', imageUrl: '/images/home-kitchen.jpg' },
  },
  BABY_KIDS: {
    label: 'Baby & Toys', icon: '🧸',
    subs: ['Baby Food & Formula', 'Diapers & Wipes', 'Baby Clothing', 'Toys & Games', 'School Supplies', 'Kids Fashion', 'Baby Gear', 'Safety Products'],
    visual: { gradient: 'linear-gradient(135deg,#F5A7D0,#C98BF5)', emoji: '🧸', imageUrl: '/images/baby-kids.jpg' },
  },
  PETS: {
    label: 'Pets', icon: '🐾',
    subs: ['Pet Food', 'Pet Treats', 'Grooming & Care', 'Toys & Accessories', 'Health & Vet', 'Bedding & Housing', 'Aquatics', 'Birds & Small Animals'],
    visual: { gradient: 'linear-gradient(135deg,#7B5C3A,#C49A6C)', emoji: '🐾', imageUrl: '/images/pets.jpg' },
  },
};


interface Props { showPromoBar?: boolean; promoText?: string; }

export function CustomerNav({ showPromoBar = true, promoText }: Props) {
  const { user, logout } = useAuth();
  const { totalCount } = useCart();
  const { selectedCity, setSelectedCity } = useCity();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'vendors' | 'menu_items'>('all');
  const [activeVendor, setActiveVendor] = useState('');
  const [bump, setBump] = useState(false);
  const [showPromo, setShowPromo] = useState(showPromoBar);
  const [cityOpen, setCityOpen] = useState(false);
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
    if (detectedCity) params.set('city', detectedCity);
    router.push(`/vendors?${params}`);
  };

  const handleVendorCat = (slug: string) => {
    setActiveVendor(slug);
    setOpenCat(null);
    router.push(slug ? `/vendors?category=${slug}` : '/vendors');
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
  };

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
              onClick={() => router.push('/vendors')}
              aria-label="Search"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </button>

            <a href="https://app.gobuyme.shop/downloads" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm nav-get-app" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round" strokeWidth="3"/></svg>
              Get App
            </a>
            {user ? (
              <>
                <Link href="/notifications" className="icon-btn nav-notif" aria-label="Notifications">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </Link>
                <Link href="/cart" className="icon-btn" aria-label="Cart">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  {totalCount > 0 && <span className={`cart-badge${bump ? ' bump' : ''}`}>{totalCount}</span>}
                </Link>
                <Link href="/profile" style={{ display: 'flex', alignItems: 'center' }}>
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
                <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
                <Link href="/onboarding" className="btn btn-primary btn-sm nav-register">Register</Link>
              </>
            )}
          </div>
        </div>
      </header>

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
                        onClick={() => { router.push(`/vendors?category=${allHoveredSub}&q=${encodeURIComponent(sub)}`); setOpenCat(null); }}
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
                            onClick={() => { router.push(`/vendors?category=${allHoveredSub}&q=${encodeURIComponent(sub)}`); setOpenCat(null); }}
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
                      onClick={() => { router.push(`/vendors?category=${openCat}&q=${encodeURIComponent(sub)}`); setOpenCat(null); }}
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
                          onClick={() => { router.push(`/vendors?category=${openCat}&q=${encodeURIComponent(sub)}`); setOpenCat(null); }}
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
