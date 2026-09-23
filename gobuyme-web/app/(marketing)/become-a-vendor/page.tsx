import type { Metadata } from 'next';
import Vendors from '@/marketing/pages/Vendors';
import { SITE_URL, VENDOR_FAQ, faqJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Sell on GoBuyMe — Delivery Marketplace for Owerri Restaurants, Stores & Pharmacies',
  description:
    'List your restaurant, grocery store or pharmacy on GoBuyMe. 0% setup fee, daily payouts, commissions from 3%, multi-branch support and real-time order tracking. Now onboarding in Owerri.',
  alternates: { canonical: '/become-a-vendor' },
  keywords: [
    'online delivery marketplace Nigeria', 'sell food online Nigeria',
    'list restaurant online Nigeria', 'grocery delivery marketplace Nigeria',
    'pharmacy delivery marketplace Nigeria', 'vendor commission delivery app Nigeria',
    'multi-location restaurant delivery Nigeria', 'GoBuyMe for vendors',
  ],
  openGraph: {
    title: 'Sell on GoBuyMe — Delivery Marketplace for Nigerian Merchants',
    description: 'Low commissions, daily payouts and real-time order tracking for Nigerian restaurants, grocery stores and pharmacies.',
    url: '/become-a-vendor',
  },
};

const faqLd = faqJsonLd(VENDOR_FAQ, `${SITE_URL}/become-a-vendor#faq`);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Vendors />
    </>
  );
}
