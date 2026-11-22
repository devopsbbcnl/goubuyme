import * as ImageManipulator from 'expo-image-manipulator';

// Longest side we keep for uploads. Phone photos are 4000px+ (several MB); nothing in the
// apps shows a picture bigger than this, and smaller uploads are much faster on mobile data.
const MAX_UPLOAD_SIDE = 1600;
const UPLOAD_QUALITY = 0.82;

/**
 * Downscales a local photo to MAX_UPLOAD_SIDE and re-encodes it as JPEG. Never crops.
 * Falls back to the original uri if anything goes wrong, so an upload is never blocked by it.
 */
export async function prepareForUpload(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_UPLOAD_SIDE } }],
      { compress: UPLOAD_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
}

// Our own storage (Cloudflare R2) is served from this address. Right-sized copies are requested through Cloudflare's
// image transformations (/cdn-cgi/image/...), which must be switched on for the domain first; until then (flag off)
// the stored picture, already shrunk to 1600px at upload, is used as it is.
const MEDIA_URL = (process.env.EXPO_PUBLIC_MEDIA_URL ?? 'https://ifenkili.gobuyme.shop').replace(/\/+$/, '');
const RESIZING = process.env.EXPO_PUBLIC_IMAGE_RESIZING === 'true';

/**
 * Returns the address to display for a stored picture, at about the width it is shown.
 * - Our storage: a right-sized, best-format copy via Cloudflare when resizing is switched on, otherwise the picture itself.
 * - Older Cloudinary images: Cloudinary's right-sized copy (f_auto picks WebP/AVIF where the device supports it, q_auto
 *   tunes quality, c_limit never upscales).
 * - Local and other addresses are returned untouched.
 */
export function optimizedUrl(url: string, width = 1200): string {
  if (url.startsWith(`${MEDIA_URL}/`)) {
    if (!RESIZING) return url;
    return `${MEDIA_URL}/cdn-cgi/image/width=${Math.round(width)},quality=80,format=auto${url.slice(MEDIA_URL.length)}`;
  }
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const start = i + marker.length;
  if (/^(f_|q_|w_|c_)/.test(url.slice(start))) return url;
  return `${url.slice(0, start)}f_auto,q_auto,w_${width},c_limit/${url.slice(start)}`;
}
