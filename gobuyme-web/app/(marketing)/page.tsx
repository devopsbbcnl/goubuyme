import type { Metadata } from 'next';
import Index from '@/marketing/pages/Index';
import { SITE_URL, SITE_NAME, SEO_CITIES, MARKETING_FAQ, faqJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'GoBuyMe — Food Delivery in Owerri | Jollof, Groceries & More in 25 Mins',
  description:
    'GoBuyMe delivers food, groceries, pharmacy and errands across Owerri. Order in three taps. Track live. Eat happy. Expanding to more Nigerian cities soon.',
  alternates: { canonical: '/' },
  keywords: [
    'food delivery Nigeria', 'food delivery Owerri',
    'order food online Nigeria', 'grocery delivery Owerri',
    'pharmacy delivery Owerri', 'errand services Nigeria',
    'jollof rice delivery', 'best food delivery app Nigeria', 'GoBuyMe',
  ],
  openGraph: { url: '/' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      legalName: 'Bubble Barrel Commerce Limited',
      url: SITE_URL,
      logo: `${SITE_URL}/marketing/logo.png`,
      description: "Owerri's on-demand delivery platform. Food, groceries, and more in 25 minutes or less. Expanding across Nigeria.",
      areaServed: SEO_CITIES.map(city => ({ '@type': 'City', name: city })),
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'support@gobuyme.shop', availableLanguage: 'en' },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/vendors?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'MobileApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'GoBuyMe',
      operatingSystem: 'ANDROID, IOS',
      applicationCategory: 'FoodApplication',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'NGN' },
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

const faqLd = faqJsonLd(MARKETING_FAQ, `${SITE_URL}/#faq`);

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Index />
    </>
  );
}
