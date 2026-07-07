import type { Metadata } from 'next';
import HowToPage from '@/marketing/pages/how-to/HowToPage';

export const metadata: Metadata = {
  title: 'How to Use GoBuyMe — Ordering, Vendor & Rider Guides',
  description: 'Step-by-step guides for ordering food, selling as a vendor, and delivering as a rider on GoBuyMe.',
  alternates: { canonical: '/how-to' },
};

export default function Page() { return <HowToPage />; }
