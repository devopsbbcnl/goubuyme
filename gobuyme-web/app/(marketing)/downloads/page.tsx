import type { Metadata } from 'next';
import Downloads from '@/marketing/pages/Downloads';

export const metadata: Metadata = {
  title: 'Download the GoBuyMe App — Android & iOS',
  description: 'Download GoBuyMe for customers, GoBuyMe Restaurant for vendors, or GoBuyMe Ryder for riders. Free delivery on your first order.',
  alternates: { canonical: '/downloads' },
};

export default function Page() { return <Downloads />; }
