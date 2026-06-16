import { redirect } from 'next/navigation';
// Next.js resolves the duplicate / route by preferring app/page.tsx over this group page.
// This file exists only to satisfy the route-group's structural requirements.
export default function CustomerGroupRoot() { redirect('/home'); }
