import type { Metadata } from 'next';
import './marketing.css';
import { Toaster } from '@/marketing/components/ui/toaster';
import { Toaster as Sonner } from '@/marketing/components/ui/sonner';
import { TooltipProvider } from '@/marketing/components/ui/tooltip';
import { WhatsAppFab } from '@/components/ui/WhatsAppFab';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

const MARKETING_TITLE = 'GoBuyMe — Jollof, Groceries & Anything Else, Delivered in 25 Mins';
const MARKETING_DESCRIPTION =
  'GoBuyMe delivers food, groceries, pharmacy and errands across Lagos, Abuja, Port Harcourt and more Nigerian cities. Order in three taps. Track live. Eat happy.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: MARKETING_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: MARKETING_DESCRIPTION,
  applicationName: SITE_NAME,
  category: 'food',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_NG',
    url: '/',
    title: MARKETING_TITLE,
    description: MARKETING_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: MARKETING_TITLE,
    description: MARKETING_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

// Root layout for the marketing/landing side of the site. The ordering app has
// its own root layout in app/(shop)/layout.tsx — navigation between the two
// groups triggers a full page load, which keeps their CSS fully isolated.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>
          {children}
          <WhatsAppFab />
          <Toaster />
          <Sonner />
        </TooltipProvider>
      </body>
    </html>
  );
}
