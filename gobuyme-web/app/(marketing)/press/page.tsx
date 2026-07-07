import type { Metadata } from 'next';
import Press from '@/marketing/pages/Press';

export const metadata: Metadata = {
  title: 'Press & Media',
  description: "Press resources, brand assets and media contacts for GoBuyMe, Nigeria's fastest on-demand delivery platform.",
  alternates: { canonical: '/press' },
};

export default function Page() { return <Press />; }
