import type { Metadata } from 'next';
import Groceries from '@/marketing/pages/Groceries';

export const metadata: Metadata = {
  title: 'Grocery Delivery in Owerri — Same-Day Essentials',
  description: 'Fresh groceries and household essentials delivered same-day across Owerri. Shop EMART on GoBuyMe.',
  alternates: { canonical: '/groceries' },
};

export default function Page() { return <Groceries />; }
