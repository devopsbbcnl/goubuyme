import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { CustomerNav } from '@/components/layout/CustomerNav';
import { CustomerFooter } from '@/components/layout/CustomerFooter';
import { HomeClient } from '@/components/home/HomeClient';
import { SITE_URL, SEO_CITIES, HOME_FAQ } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Order Food Online — Browse 500+ Restaurants & Stores',
  description:
    'Order food online from 500+ restaurants & stores in Lagos, Abuja, Port Harcourt & across Nigeria. Jollof, suya, groceries & medicine delivered in 25 minutes.',
  alternates: { canonical: '/home' },
  keywords: [
    'order food online Nigeria', 'food delivery Lagos', 'food delivery Abuja',
    'food delivery Port Harcourt', 'grocery delivery Nigeria',
    'pharmacy delivery Nigeria', 'jollof rice delivery', 'suya near me',
    'shawarma delivery', 'restaurants near me', 'GoBuyMe',
  ],
  openGraph: {
    title: 'GoBuyMe — Order Food, Groceries & More in 25 Minutes',
    description:
      'Order food, groceries & medicine from 500+ vendors across Nigeria. Free delivery on your first app order.',
    url: '/home',
    type: 'website',
  },
};

const POPULAR_SEARCHES = [
  { label: 'Jollof rice delivery', href: '/vendors?q=Jollof%20Rice&category=RESTAURANT' },
  { label: 'Suya near me', href: '/vendors?q=Suya&category=RESTAURANT' },
  { label: 'Shawarma delivery', href: '/vendors?q=Shawarma&category=RESTAURANT' },
  { label: 'Pizza delivery', href: '/vendors?q=Pizza&category=RESTAURANT' },
  { label: 'Amala near me', href: '/vendors?q=Amala&category=RESTAURANT' },
  { label: 'Fried chicken delivery', href: '/vendors?q=Chicken&category=RESTAURANT' },
  { label: 'Grocery delivery', href: '/vendors?category=EMART' },
  { label: 'Pharmacy delivery', href: '/vendors?category=PHARMACY' },
  { label: 'Bakery & small chops', href: '/vendors?q=Bakery&category=RESTAURANT' },
  { label: 'Late-night food delivery', href: '/vendors' },
];

// FAQPage schema matching the visible FAQ below. Organization/WebSite schema
// lives on the marketing landing page at /.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/home#faq`,
  mainEntity: HOME_FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function ShopHomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* CustomerNav reads useSearchParams(), so it needs a Suspense boundary
          to keep the rest of the page statically prerenderable. */}
      <Suspense fallback={null}>
        <CustomerNav />
      </Suspense>
      <main style={{ flex: 1 }}>
        <HomeClient />

        {/* ── Server-rendered SEO sections ── */}
        <div className="inner">

          {/* Popular searches — internal links with keyword anchors */}
          <div className="section">
            <div className="section-head"><h2 className="section-title">Popular right now</h2></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {POPULAR_SEARCHES.map(s => (
                <Link key={s.label} href={s.href} className="card" style={{ padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'var(--text2)', textDecoration: 'none' }}>
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Cities served */}
          <div className="section">
            <div className="section-head"><h2 className="section-title">Food delivery in your city</h2></div>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 720, marginBottom: 16 }}>
              GoBuyMe delivers hot meals, fresh groceries and pharmacy essentials across Nigeria&apos;s biggest cities.
              Pick your city to see restaurants and stores that deliver to you in 25 minutes or less.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {SEO_CITIES.map(city => (
                <Link key={city} href={`/vendors?city=${encodeURIComponent(city)}`} className="card" style={{ padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'var(--text2)', textDecoration: 'none' }}>
                  Food delivery in {city}
                </Link>
              ))}
            </div>
          </div>

          {/* FAQ — visible content matching the FAQPage JSON-LD above */}
          <div className="section">
            <div className="section-head"><h2 className="section-title">Frequently asked questions</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 820 }}>
              {HOME_FAQ.map(({ q, a }) => (
                <details key={q} className="card" style={{ padding: '14px 18px' }}>
                  <summary style={{ fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{q}</summary>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}>{a}</p>
                </details>
              ))}
            </div>
          </div>

          {/* Keyword-rich closing copy */}
          <div className="section">
            <h2 className="section-title" style={{ marginBottom: 12 }}>Nigeria&apos;s super-app for food, groceries & more</h2>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.8, maxWidth: 820 }}>
              GoBuyMe is the fastest way to <strong>order food online in Nigeria</strong>. Whether you&apos;re craving
              smoky party jollof, fresh suya, amala and ewedu, or a late-night shawarma, our riders bring it hot from
              500+ local restaurants in about 25 minutes. Need more than food? Shop <Link href="/vendors?category=EMART">EMART grocery delivery</Link> for
              everyday essentials, or get medicine delivered from trusted <Link href="/vendors?category=PHARMACY">pharmacies near you</Link>.
              Track your rider live on the map, pay securely with Paystack, and enjoy free delivery on your first order
              when you <a href="/downloads">download the GoBuyMe app</a>.
            </p>
          </div>

        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
