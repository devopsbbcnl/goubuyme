import type { Metadata } from 'next';
import Contact from '@/marketing/pages/Contact';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Questions, feedback or partnerships? Get in touch with the GoBuyMe team — we respond fast.',
  alternates: { canonical: '/contact' },
};

export default function Page() { return <Contact />; }
