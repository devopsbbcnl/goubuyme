import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Authenticated / account areas — no SEO value, avoid crawl waste.
        // Note: /vendor/[id] (public vendor pages) must stay crawlable, so only
        // the exact dashboard routes are blocked ($ = end-of-URL for Googlebot).
        '/cart', '/checkout', '/orders', '/profile', '/notifications',
        '/vendor$', '/vendor/menu', '/vendor/orders', '/vendor/earnings',
        '/vendor/promotions', '/rider', '/verify-otp',
        '/vendor-complete-profile', '/role-select', '/api/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
