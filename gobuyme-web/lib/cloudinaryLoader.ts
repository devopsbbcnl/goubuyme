import type { ImageLoaderProps } from 'next/image';

// Registered as the global next/image loader (see next.config.ts). Next asks for each responsive width it needs.
//
// - Our own storage (R2, served from NEXT_PUBLIC_MEDIA_URL): uploads are already shrunk to 1600px before they
//   leave the browser or phone, so the original is served as it is. If Cloudflare Image Resizing is switched on for
//   the domain, set NEXT_PUBLIC_IMAGE_RESIZING=true and each width is requested through /cdn-cgi/image/ (the address
//   Cloudflare resizes at its edge, in the best format for the browser).
// - Older images still on Cloudinary keep using Cloudinary's resizing until they are migrated.
// - Anything else is returned untouched.
const MEDIA_URL = (process.env.NEXT_PUBLIC_MEDIA_URL ?? 'https://ifenkili.gobuyme.shop').replace(/\/+$/, '');
const RESIZING = process.env.NEXT_PUBLIC_IMAGE_RESIZING === 'true';

export default function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  if (src.startsWith(`${MEDIA_URL}/`)) {
    if (!RESIZING) return src;
    const path = src.slice(MEDIA_URL.length);
    return `${MEDIA_URL}/cdn-cgi/image/width=${width},quality=${quality ?? 80},format=auto${path}`;
  }

  const marker = '/image/upload/';
  const i = src.indexOf(marker);
  if (i === -1) return src;
  const start = i + marker.length;
  if (src.slice(start).startsWith('f_auto')) return src;
  return `${src.slice(0, start)}f_auto,q_auto,w_${width},c_limit/${src.slice(start)}`;
}
