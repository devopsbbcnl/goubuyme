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

/**
 * Asks Cloudinary for a right-sized, best-format copy for display (f_auto picks WebP/AVIF where
 * the device supports it, q_auto tunes quality, c_limit never upscales). Non-Cloudinary and
 * local uris are returned untouched.
 */
export function optimizedUrl(url: string, width = 1200): string {
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const start = i + marker.length;
  if (/^(f_|q_|w_|c_)/.test(url.slice(start))) return url;
  return `${url.slice(0, start)}f_auto,q_auto,w_${width},c_limit/${url.slice(start)}`;
}
