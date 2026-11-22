/**
 * Private storage for identity and verification images (NDPA register G3).
 *
 * Identity documents, selfies, business certificates and licences are uploaded to Cloudinary with
 * `type=authenticated`, so the image URL alone shows nothing. The app asks the backend for a signed
 * upload ticket (the Cloudinary secret never leaves the server); the database stores a canonical
 * URL; and whenever an image is shown to its owner or an admin the backend swaps that URL for a
 * short-lived signed download link.
 *
 * Older records still hold public `/image/upload/` URLs. They keep working and are returned
 * unchanged until the file is replaced, at which point the new upload is private.
 */
import { v2 as cloudinary } from 'cloudinary';

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

export interface UploadTicket {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  type: 'authenticated';
  uploadUrl: string;
}

/** Signed parameters the app must send, unchanged, with the file. Scoped to the caller's own folder. */
export function createUploadTicket(userId: string, now: Date = new Date()): UploadTicket {
  configure();
  const timestamp = Math.floor(now.getTime() / 1000);
  const folder = `${KYC_FOLDER}/${userId}`;
  const type = 'authenticated' as const;
  const signature = cloudinary.utils.api_sign_request({ folder, timestamp, type }, process.env.CLOUDINARY_API_SECRET ?? '');
  return {
    cloudName: CLOUD(),
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    timestamp,
    signature,
    folder,
    type,
    uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD()}/image/upload`,
  };
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
 * What goes into the database: private images are stored without any signature or expiry,
 * legacy public images unchanged. Anything else (another site, another account, a link to a
 * different user's private file) returns null so the caller can reject it.
 */
export function canonicalKycUrl(url: unknown, ownerUserId?: string): string | null | undefined {
  if (url === undefined) return undefined;
  if (url === null || url === '') return null;
  if (typeof url !== 'string') return null;
  const p = parsePrivateUrl(url);
  if (p) {
    if (!p.publicId.startsWith(`${KYC_FOLDER}/`)) return null;
    if (ownerUserId && !p.publicId.startsWith(`${KYC_FOLDER}/${ownerUserId}/`)) return null;
    return `https://res.cloudinary.com/${CLOUD()}/image/authenticated/${p.publicId}.${p.format}`;
  }
  if (isLegacyPublicUrl(url)) return url;
  return null;
}

/** Turns a stored URL into something a browser can open right now. Public/legacy URLs pass through. */
export function signKycUrl(url: string | null | undefined, now: Date = new Date()): string | null | undefined {
  if (!url) return url;
  const p = parsePrivateUrl(url);
  if (!p) return url;
  configure();
  return cloudinary.utils.private_download_url(p.publicId, p.format, {
    type: 'authenticated',
    resource_type: 'image',
    expires_at: Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS,
  });
}

/**
 * Deletes stored images (private identity photos and legacy public ones) from Cloudinary.
 * Best effort: returns how many were removed and never throws, so a Cloudinary hiccup cannot undo an erasure.
 */
export async function deleteStoredImages(urls: string[]): Promise<number> {
  configure();
  let removed = 0;
  for (const url of urls) {
    try {
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
      /* ignore: the record is already gone; a leftover file is cleaned up by the periodic sweep */
    }
  }
  return removed;
}

/** Copy of `row` with the named image fields replaced by short-lived links. */
export function signKycFields<T extends Record<string, unknown>>(row: T, fields: readonly (keyof T)[]): T {
  if (!row) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = out[f as string];
    if (typeof v === 'string') out[f as string] = signKycUrl(v);
  }
  return out as T;
}

export const KYC_IMAGE_FIELDS = {
  riderDocument: ['ninImageUrl', 'selfieUrl', 'vehicleImageUrl'],
  vendorDocument: ['imageUrl', 'imageUrlBack', 'selfieUrl'],
  vendorBusiness: ['cacImageUrl'],
  vendorLicense: ['imageUrl'],
} as const;
