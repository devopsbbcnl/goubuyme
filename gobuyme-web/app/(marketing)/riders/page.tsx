import type { Metadata } from 'next';
import Riders from '@/marketing/pages/Riders';

export const metadata: Metadata = {
  title: 'Become a Delivery Rider — Flexible Earnings',
  description: 'Ride with GoBuyMe and earn 85% of every delivery fee. Flexible hours, daily payouts, and live support across Nigeria.',
  alternates: { canonical: '/riders' },
};

export default function Page() { return <Riders />; }
