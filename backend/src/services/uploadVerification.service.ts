/**
 * Save-time check of uploaded files.
 *
 * A signed upload link cannot limit file size or type, so before a record that points at an uploaded file is saved,
 * the API looks at the stored file: it must exist, be within UPLOAD_MAX_BYTES (default 15 MB) and be an allowed image
 * type. A file that is too large or the wrong type is deleted on the spot.
 *
 * Only our own R2 files are checked (private `r2-kyc:` and `r2-hr:` references and public addresses on R2_MEDIA_PUBLIC_URL).
 * Older Cloudinary addresses and anything else pass through unchanged.
 */
import { parseKycReference, parseHrReference, mediaKeyFromUrl, isConfigured, verifyStoredObject, type BucketKind } from './objectStorage.service';

interface Target { kind: BucketKind; key: string }

export function uploadTargets(urls: Array<string | null | undefined>, env: NodeJS.ProcessEnv = process.env): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const u of urls) {
    if (!u || typeof u !== 'string') continue;
    // Identity photos (r2-kyc:) and HR documents (r2-hr:) both live in the private bucket.
    const privateKey = parseKycReference(u) ?? parseHrReference(u);
    const mediaKey = privateKey ? null : mediaKeyFromUrl(u, env);
    const t: Target | null = privateKey ? { kind: 'kyc', key: privateKey } : mediaKey ? { kind: 'media', key: mediaKey } : null;
    if (t && !seen.has(`${t.kind}:${t.key}`)) { seen.add(`${t.kind}:${t.key}`); out.push(t); }
  }
  return out;
}

/** Returns a message to show the person when a file fails the check, or null when every file is fine. */
export async function verifyUploads(urls: Array<string | null | undefined>): Promise<string | null> {
  for (const t of uploadTargets(urls)) {
    if (!isConfigured(t.kind)) continue;
    const verdict = await verifyStoredObject(t.kind, t.key);
    if (!verdict.ok) return verdict.message;
  }
  return null;
}
