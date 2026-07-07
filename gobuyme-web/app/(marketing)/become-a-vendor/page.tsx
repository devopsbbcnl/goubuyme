import type { Metadata } from 'next';
import Vendors from '@/marketing/pages/Vendors';

export const metadata: Metadata = {
  title: 'Become a Vendor — Sell Food & Groceries Online',
  description: 'List your restaurant, store or pharmacy on GoBuyMe and reach thousands of hungry customers. Low commissions, free sign-up.',
  alternates: { canonical: '/become-a-vendor' },
};

export default function Page() { return <Vendors />; }
