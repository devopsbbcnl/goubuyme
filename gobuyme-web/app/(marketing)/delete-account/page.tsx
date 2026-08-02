import type { Metadata } from 'next';
import DeleteAccount from '@/marketing/pages/DeleteAccount';

export const metadata: Metadata = {
  title: 'Delete Your Account',
  description: 'How to delete your GoBuyMe account and personal data, in-app or by request.',
  alternates: { canonical: '/delete-account' },
};

export default function Page() { return <DeleteAccount />; }
