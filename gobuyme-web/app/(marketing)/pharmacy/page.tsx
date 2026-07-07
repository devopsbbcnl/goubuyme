import type { Metadata } from 'next';
import Pharmacy from '@/marketing/pages/Pharmacy';

export const metadata: Metadata = {
  title: 'Pharmacy & Medicine Delivery in Nigeria',
  description: 'Get medicine, health and wellness products delivered from trusted pharmacies near you — fast, discreet and reliable with GoBuyMe.',
  alternates: { canonical: '/pharmacy' },
};

export default function Page() { return <Pharmacy />; }
