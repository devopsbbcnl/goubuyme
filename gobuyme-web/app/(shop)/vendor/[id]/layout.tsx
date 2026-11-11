import type { Metadata } from 'next';
import { CustomerNav } from '@/components/layout/CustomerNav';
import { CustomerFooter } from '@/components/layout/CustomerFooter';

// Same server-side base the other route handlers use (see app/api/health).
const API_BASE = process.env.BACKEND_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

// Gives a shared store link a proper title, description and picture when it is pasted into
// WhatsApp, Instagram, X and so on. Falls back to the site defaults if the store can't be loaded.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE}/vendors/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const v = (await res.json())?.data as { businessName?: string; description?: string | null; city?: string; logo?: string | null; coverImage?: string | null } | undefined;
    if (!v?.businessName) return {};
    const title = `${v.businessName} on GoBuyMe`;
    const description = (v.description?.trim() || `Order from ${v.businessName}${v.city ? ` in ${v.city}` : ''} on GoBuyMe.`).slice(0, 200);
    const image = v.coverImage || v.logo || undefined;
    return {
      title,
      description,
      openGraph: { title, description, type: 'website', ...(image ? { images: [{ url: image }] } : {}) },
      twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return {};
  }
}

export default function VendorDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CustomerNav />
      <main style={{ flex: 1 }}>
        {children}
      </main>
      <CustomerFooter />
    </div>
  );
}
