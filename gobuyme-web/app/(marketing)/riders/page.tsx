import type { Metadata } from 'next';
import Riders from '@/marketing/pages/Riders';
import { SITE_URL, RIDER_FAQ, faqJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Become a GoBuyMe Rider — Flexible Delivery Jobs in Owerri',
  description:
    'Ride with GoBuyMe in Owerri and earn up to ₦256,000+/month. Flexible hours, weekly payouts, free insurance and bike financing — no shifts, no bosses.',
  alternates: { canonical: '/riders' },
  keywords: [
    'delivery rider job Nigeria', 'dispatch rider job Owerri',
    'bike delivery job Nigeria', 'GoBuyMe rider', 'become a delivery rider Owerri',
    'delivery app rider earnings Nigeria',
  ],
  openGraph: {
    title: 'Become a GoBuyMe Rider — Flexible Delivery Jobs in Owerri',
    description: 'Flexible hours, weekly payouts and free insurance for GoBuyMe delivery riders in Owerri.',
    url: '/riders',
  },
};

const faqLd = faqJsonLd(RIDER_FAQ, `${SITE_URL}/riders#faq`);

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <Riders />
    </>
  );
}
