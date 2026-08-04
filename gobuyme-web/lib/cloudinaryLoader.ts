import type { ImageLoaderProps } from 'next/image';

// Registered as the global next/image loader (see next.config.ts). Next asks
// for each responsive width it needs; we hand that off to Cloudinary's URL
// transform instead of Vercel's own image optimizer, since Cloudinary already
// does format negotiation (f_auto) and quality tuning (q_auto) at the CDN edge.
export default function cloudinaryLoader({ src, width }: ImageLoaderProps): string {
  const marker = '/image/upload/';
  const i = src.indexOf(marker);
  if (i === -1) return src;
  const start = i + marker.length;
  if (src.slice(start).startsWith('f_auto')) return src;
  return `${src.slice(0, start)}f_auto,q_auto,w_${width},c_limit/${src.slice(start)}`;
}
