import type { Metadata } from 'next';
import Affiliate from '@/marketing/pages/Affiliate';

export const metadata: Metadata = {
  title: 'GoBuyMe Affiliate Program — Earn by Referring',
  description: 'Share GoBuyMe, earn rewards. Join the affiliate program and get paid for every customer you refer.',
  alternates: { canonical: '/affiliate' },
};

export default function Page() { return <Affiliate />; }
