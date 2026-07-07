import type { MetadataRoute } from 'next';
import { SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Food & Grocery Delivery in Nigeria`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F5F3',
    theme_color: '#FF521B',
    icons: [{ src: '/icon.png', sizes: 'any', type: 'image/png' }],
  };
}
