import type { Metadata } from 'next';
import Food from '@/marketing/pages/Food';

export const metadata: Metadata = {
  title: 'Food Delivery in Nigeria — Hot Meals in 25 Minutes',
  description: 'Order jollof, suya, shawarma, pizza and more from the best restaurants near you. GoBuyMe delivers hot food across Nigeria in 25 minutes or less.',
  alternates: { canonical: '/food' },
};

export default function Page() { return <Food />; }
