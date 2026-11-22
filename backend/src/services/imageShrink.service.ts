/**
 * Shrinks photos that are bigger than the apps ever display. Used by the Cloudinary-to-R2 migration so old uploads
 * that were never shrunk (avatars, logos, covers, promos) do not land in storage at full phone-camera size.
 * Never crops; keeps the original format; leaves small images, GIFs and SVGs untouched.
 */
import sharp from 'sharp';

/** Longest side kept, the same limit the apps use before uploading. */
export const MAX_SIDE = 1600;
const QUALITY = 82;

export interface ShrinkResult {
  body: Buffer;
  contentType: string;
  changed: boolean;
}

export async function shrinkImage(body: Buffer, contentType: string, maxSide = MAX_SIDE): Promise<ShrinkResult> {
  const unchanged = { body, contentType, changed: false };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return unchanged;

  try {
    const img = sharp(body, { failOn: 'none' });
    const meta = await img.metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
    // Small enough already: keep the original bytes unless the file is unusually heavy for its size.
    if (longest > 0 && longest <= maxSide && body.length <= 800 * 1024) return unchanged;

    // rotate() applies the camera's orientation so a shrunk photo is never sideways.
    let pipeline = sharp(body, { failOn: 'none' }).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    if (contentType === 'image/jpeg') pipeline = pipeline.jpeg({ quality: QUALITY, mozjpeg: true });
    else if (contentType === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
    else pipeline = pipeline.webp({ quality: QUALITY });

    const out = await pipeline.toBuffer();
    // Only use the result when it is actually smaller.
    return out.length < body.length ? { body: out, contentType, changed: true } : unchanged;
  } catch {
    return unchanged;
  }
}
