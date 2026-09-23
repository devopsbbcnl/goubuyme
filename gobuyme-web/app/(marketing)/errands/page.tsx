import type { Metadata } from 'next';
import Errands from '@/marketing/pages/Errands';

export const metadata: Metadata = {
  title: 'Errand Running & Package Delivery in Owerri',
  description: 'Need something picked up, dropped off or bought? GoBuyMe riders run your errands across Owerri in minutes.',
  alternates: { canonical: '/errands' },
};

export default function Page() { return <Errands />; }
