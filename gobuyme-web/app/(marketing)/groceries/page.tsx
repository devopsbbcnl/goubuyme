import type { Metadata } from 'next';
import Groceries from '@/marketing/pages/Groceries';

export const metadata: Metadata = {
  title: 'Grocery Delivery in Nigeria — Same-Day Essentials',
  description: 'Fresh groceries and household essentials delivered same-day across Lagos, Abuja, Port Harcourt and more. Shop EMART on GoBuyMe.',
  alternates: { canonical: '/groceries' },
};

export default function Page() { return <Groceries />; }
