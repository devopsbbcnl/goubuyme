/**
 * Private storage for identity and verification images (NDPA register G2, G3).
 *
 * New uploads go to the private Cloudflare R2 bucket (see objectStorage.service.ts) and are stored as
 * `r2-kyc:kyc/<userId>/<id>.<ext>`. Whenever an image is shown to its owner or an admin, the API swaps that
 * reference for a 15-minute signed link.
 *
 * Older records hold Cloudinary addresses: private `/image/authenticated/` ones from the first version of this
 * flow and public `/image/upload/` ones from before that. They keep working until migrated
 * (scripts/migrate-uploads-to-r2.ts) and are never written by new code.
 */
import { v2 as cloudinary } from 'cloudinary';
import {
  parseKycReference, kycKeyFromSignedUrl, kycReference, signedViewUrl, deleteObject, mediaKeyFromUrl,
  isConfigured,
} from './objectStorage.service';

const CLOUD = () => process.env.CLOUDINARY_CLOUD_NAME ?? '';
const KYC_FOLDER = 'kyc';
/** How long a signed download link works. Long enough to load a page, short enough not to be shared. */
const LINK_TTL_SECONDS = 15 * 60;

function configure(): void {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

interface Parsed { publicId: string; format: string; }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reads public id + extension out of one of our private image URLs (canonical or download form). */
export function parsePrivateUrl(url: string): Parsed | null {
  if (!url) return null;
  const cloud = CLOUD();
  if (!cloud) return null;
  // Canonical: https://res.cloudinary.com/<cloud>/image/authenticated/[s--sig--/][v123/]kyc/<user>/<id>.<ext>
  const canonical = new RegExp(`^https://res\\.cloudinary\\.com/${escapeRe(cloud)}/image/authenticated/(?:s--[^/]+--/)?(?:v\\d+/)?(.+)\\.([A-Za-z0-9]+)$`);
  const m = canonical.exec(url);
  if (m) return { publicId: decodeURIComponent(m[1]), format: m[2].toLowerCase() };
  // Signed download link we issued: https://api.cloudinary.com/v1_1/<cloud>/image/download?...public_id=..&format=..
  if (url.startsWith(`https://api.cloudinary.com/v1_1/${cloud}/image/download?`)) {
    const q = new URL(url).searchParams;
    const publicId = q.get('public_id');
    const format = q.get('format');
    if (publicId && format) return { publicId, format: format.toLowerCase() };
  }
  return null;
}

/** True for a private upload that belongs to this app's KYC folder. */
export function isPrivateKycUrl(url: string): boolean {
  const p = parsePrivateUrl(url);
  return !!p && p.publicId.startsWith(`${KYC_FOLDER}/`);
}

/** Legacy public image on our own Cloudinary account (kept readable so old records still work). */
export function isLegacyPublicUrl(url: string): boolean {
  const cloud = CLOUD();
  return !!cloud && new RegExp(`^https://res\\.cloudinary\\.com/${escapeRe(cloud)}/image/upload/`).test(url);
}

/**
 * What goes into the database for an identity image:
 *  - a private R2 reference (`r2-kyc:kyc/<user>/<id>.jpg`), also recovered from a signed view link an app echoes back;
 *  - an existing Cloudinary private image (signature stripped), or a legacy public Cloudinary image, unchanged.
 * Anything else (another site, another account, a different user's private file) returns null so the caller can reject it.
 * `ownerUserId` is the signed-in person; admins creating records for someone else pass nothing.
 */
export function canonicalKycUrl(url: unknown, ownerUserId?: string): string | null | undefined {
  if (url === undefined) return undefined;
  if (url === null || url === '') return null;
  if (typeof url !== 'string') return null;

  const r2Key = parseKycReference(url) ?? kycKeyFromSignedUrl(url);
  if (r2Key) {
    if (ownerUserId && !r2Key.startsWith(`${KYC_FOLDER}/${ownerUserId}/`)) return null;
    return kycReference(r2Key);
  }

  const p = parsePrivateUrl(url);
  if (p) {
    if (!p.publicId.startsWith(`${KYC_FOLDER}/`)) return null;
    if (ownerUserId && !p.publicId.startsWith(`${KYC_FOLDER}/${ownerUserId}/`)) return null;
    return `https://res.cloudinary.com/${CLOUD()}/image/authenticated/${p.publicId}.${p.format}`;
  }
  if (isLegacyPublicUrl(url)) return url;
  return null;
}

/** Short-lived link for an old private Cloudinary image. */
function signCloudinaryPrivate(p: Parsed, now: Date): string {
  configure();
  return cloudinary.utils.private_download_url(p.publicId, p.format, {
    type: 'authenticated',
    resource_type: 'image',
    expires_at: Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS,
  });
}

/**
 * Turns a stored value into something a browser can open right now: a 15-minute signed link for private
 * files (R2 or old Cloudinary-private), and the address itself for legacy public images.
 */
export async function signKycUrl(url: string | null | undefined, now: Date = new Date()): Promise<string | null | undefined> {
  if (!url) return url;
  const r2Key = parseKycReference(url);
  if (r2Key) return isConfigured('kyc') ? signedViewUrl('kyc', r2Key) : null;
  const p = parsePrivateUrl(url);
  return p ? signCloudinaryPrivate(p, now) : url;
}

/**
 * Deletes stored images wherever they live: private R2 files, public media files, and old Cloudinary images.
 * Best effort: never throws, so a storage hiccup cannot undo an erasure. Returns how many were removed.
 */
export async function deleteStoredImages(urls: string[]): Promise<number> {
  configure();
  let removed = 0;
  for (const url of urls) {
    try {
      const kycKey = parseKycReference(url);
      if (kycKey) {
        if (isConfigured('kyc')) { await deleteObject('kyc', kycKey); removed++; }
        continue;
      }
      const mediaKey = mediaKeyFromUrl(url);
      if (mediaKey) {
        if (isConfigured('media')) { await deleteObject('media', mediaKey); removed++; }
        continue;
      }
      const priv = parsePrivateUrl(url);
      if (priv) {
        const r = await cloudinary.uploader.destroy(priv.publicId, { type: 'authenticated', resource_type: 'image', invalidate: true });
        if (r.result === 'ok') removed++;
        continue;
      }
      const m = new RegExp(`^https://res\\.cloudinary\\.com/${escapeRe(CLOUD())}/image/upload/(?:v\\d+/)?(.+)\\.[A-Za-z0-9]+$`).exec(url);
      if (m) {
        const r = await cloudinary.uploader.destroy(m[1], { type: 'upload', resource_type: 'image', invalidate: true });
        if (r.result === 'ok') removed++;
      }
    } catch {
      /* ignore: the record is already gone; a leftover file is picked up by a later sweep */
    }
  }
  return removed;
}

/** Copy of `row` with the named image fields replaced by short-lived links. */
export async function signKycFields<T extends Record<string, unknown>>(row: T, fields: readonly (keyof T)[]): Promise<T> {
  if (!row) return row;
  const out: Record<string, unknown> = { ...row };
  await Promise.all(fields.map(async (f) => {
    const v = out[f as string];
    if (typeof v === 'string') out[f as string] = await signKycUrl(v);
  }));
  return out as T;
}

export const KYC_IMAGE_FIELDS = {
  riderDocument: ['ninImageUrl', 'selfieUrl', 'vehicleImageUrl'],
  vendorDocument: ['imageUrl', 'imageUrlBack', 'selfieUrl'],
  vendorBusiness: ['cacImageUrl'],
  vendorLicense: ['imageUrl'],
} as const;
