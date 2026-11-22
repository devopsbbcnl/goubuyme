/**
 * File storage on Cloudflare R2 (replaces Cloudinary for uploads).
 *
 * Two buckets, two sets of credentials:
 *  - "kyc":   private. Identity photos, selfies, certificates, licences. Never public; shown through 15-minute signed links.
 *  - "media": public through a custom domain (R2_MEDIA_PUBLIC_URL). Logos, covers, menu photos, avatars, promo images.
 *
 * Apps never hold R2 keys. They ask the API for an upload ticket (POST /uploads/ticket), which is a short-lived
 * signed PUT link for exactly one new file in the caller's own folder, and then upload straight to R2.
 *
 * Environment (see .env.example):
 *   R2_ACCOUNT_ID
 *   R2_KYC_BUCKET, R2_KYC_ACCESS_KEY_ID, R2_KYC_SECRET_ACCESS_KEY, R2_KYC_JURISDICTION (eu | default)
 *   R2_MEDIA_BUCKET, R2_MEDIA_ACCESS_KEY_ID, R2_MEDIA_SECRET_ACCESS_KEY, R2_MEDIA_JURISDICTION, R2_MEDIA_PUBLIC_URL
 */
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type BucketKind = 'kyc' | 'media';
export type Purpose = 'kyc' | 'avatar' | 'logo' | 'cover' | 'menu' | 'promo' | 'media' | 'hr' | 'hrpublic';

const ADMIN_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'];

interface PurposeRule {
  bucket: BucketKind;
  folder: string;
  /** null = any signed-in role. */
  roles: string[] | null;
  types: readonly string[];
  /** Never issued through the public /uploads/ticket route: only by code that has already decided the caller may. */
  internalOnly?: boolean;
}

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** HR files are contracts, certificates, receipts and CVs: PDFs as well as photos. */
const DOCUMENTS = [...IMAGES, 'application/pdf'] as const;

export const PURPOSES: Record<Purpose, PurposeRule> = {
  kyc:    { bucket: 'kyc',   folder: 'kyc',     roles: ['VENDOR', 'RIDER', 'LOGISTICS_COMPANY', 'SUPER_ADMIN', 'OPERATIONS_ADMIN'], types: IMAGES },
  avatar: { bucket: 'media', folder: 'avatars', roles: null, types: IMAGES },
  logo:   { bucket: 'media', folder: 'logos',   roles: ['VENDOR', 'LOGISTICS_COMPANY', ...ADMIN_ROLES], types: IMAGES },
  cover:  { bucket: 'media', folder: 'covers',  roles: ['VENDOR', ...ADMIN_ROLES], types: IMAGES },
  menu:   { bucket: 'media', folder: 'menu',    roles: ['VENDOR', ...ADMIN_ROLES], types: IMAGES },
  promo:  { bucket: 'media', folder: 'promos',  roles: ['VENDOR', ...ADMIN_ROLES], types: IMAGES },
  media:  { bucket: 'media', folder: 'library', roles: [...ADMIN_ROLES, 'SOCIAL_MEDIA'], types: [...IMAGES, 'image/gif'] },
  // HR documents live in the private bucket under hr/. `hr` is for signed-in HR users (the caller checks they have HR access);
  // `hrpublic` is for careers applicants and new hires who have no login (issued only by the public HR route).
  hr:       { bucket: 'kyc', folder: 'hr', roles: null, types: DOCUMENTS },
  hrpublic: { bucket: 'kyc', folder: 'hr', roles: null, types: DOCUMENTS, internalOnly: true },
};

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

/** Signed upload links live for 5 minutes; signed view links for private files for 15. */
export const UPLOAD_TTL_SECONDS = 5 * 60;
export const VIEW_TTL_SECONDS = 15 * 60;
/**
 * The largest file the API accepts at save time (default 15 MB, change with UPLOAD_MAX_BYTES). The apps shrink photos
 * to well under 1 MB first, so this is a ceiling against abuse and broken uploads, not a target. A signed upload link
 * cannot enforce it, so it is checked when a record is saved and by the nightly clean-up.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt(env.UPLOAD_MAX_BYTES ?? '', 10);
  return Number.isNaN(n) || n < 1024 * 1024 ? DEFAULT_MAX_UPLOAD_BYTES : n;
}

const PREFIX: Record<BucketKind, string> = { kyc: 'R2_KYC', media: 'R2_MEDIA' };

export interface BucketConfig {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Reads one bucket's settings, or null when any piece is missing (so the caller can say "not configured"). */
export function bucketConfig(kind: BucketKind, env: NodeJS.ProcessEnv = process.env): BucketConfig | null {
  const p = PREFIX[kind];
  const account = env.R2_ACCOUNT_ID;
  const bucket = env[`${p}_BUCKET`];
  const accessKeyId = env[`${p}_ACCESS_KEY_ID`];
  const secretAccessKey = env[`${p}_SECRET_ACCESS_KEY`];
  if (!account || !bucket || !accessKeyId || !secretAccessKey) return null;
  // Buckets created with the EU jurisdiction are only reachable on the .eu endpoint.
  const eu = (env[`${p}_JURISDICTION`] ?? '').toLowerCase() === 'eu';
  return { bucket, accessKeyId, secretAccessKey, endpoint: `https://${account}${eu ? '.eu' : ''}.r2.cloudflarestorage.com` };
}

export const isConfigured = (kind: BucketKind, env: NodeJS.ProcessEnv = process.env): boolean => bucketConfig(kind, env) !== null;

const clients = new Map<string, S3Client>();

function clientFor(kind: BucketKind, cfg: BucketConfig): S3Client {
  const cacheKey = `${kind}:${cfg.endpoint}:${cfg.accessKeyId}`;
  let c = clients.get(cacheKey);
  if (!c) {
    c = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // R2 rejects the extra checksum headers newer SDK versions add by default.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    clients.set(cacheKey, c);
  }
  return c;
}

function need(kind: BucketKind): { cfg: BucketConfig; client: S3Client } {
  const cfg = bucketConfig(kind);
  if (!cfg) throw new StorageNotConfiguredError(kind);
  return { cfg, client: clientFor(kind, cfg) };
}

export class StorageNotConfiguredError extends Error {
  constructor(public kind: BucketKind) {
    super(`File storage (${kind}) is not configured.`);
  }
}

export class UploadNotAllowedError extends Error {}

/** Base address that public files are served from, no trailing slash. */
export const publicBase = (env: NodeJS.ProcessEnv = process.env): string => (env.R2_MEDIA_PUBLIC_URL ?? '').replace(/\/+$/, '');

export interface UploadTicket {
  provider: 'r2';
  purpose: Purpose;
  uploadUrl: string;
  method: 'PUT';
  /** Headers the app must send exactly as given, or R2 rejects the signature. */
  headers: Record<string, string>;
  key: string;
  /** What to send back to the API when saving the record (public URL for media, `r2-kyc:<key>` for private files). */
  reference: string;
  expiresInSeconds: number;
  maxBytes: number;
}

/** Key for a new file: `<folder>/<userId>/<random>.<ext>`. Random, so a key cannot be guessed or overwritten. */
export function buildKey(purpose: Purpose, userId: string, contentType: string, id: string = crypto.randomUUID()): string {
  const ext = EXT[contentType];
  if (!ext) throw new UploadNotAllowedError('That file type is not allowed.');
  return `${PURPOSES[purpose].folder}/${userId}/${id}.${ext}`;
}

export const kycReference = (key: string): string => `r2-kyc:${key}`;
export const hrReference = (key: string): string => `r2-hr:${key}`;
/** The reference stored for a private file: ID photos are `r2-kyc:`, HR documents `r2-hr:`. */
export const privateReference = (key: string): string => (key.startsWith('hr/') ? hrReference(key) : kycReference(key));

export async function createUploadTicket(opts: { purpose: string; userId: string; role: string; contentType: string; allowInternal?: boolean }): Promise<UploadTicket> {
  const rule = PURPOSES[opts.purpose as Purpose];
  if (!rule || (rule.internalOnly && !opts.allowInternal)) throw new UploadNotAllowedError('Unknown upload type.');
  if (rule.roles && !rule.roles.includes(opts.role)) throw new UploadNotAllowedError('Your account cannot upload this.');
  if (!rule.types.includes(opts.contentType)) throw new UploadNotAllowedError('That file type is not allowed. Use a JPG, PNG or WebP image.');

  const { cfg, client } = need(rule.bucket);
  const purpose = opts.purpose as Purpose;
  const key = buildKey(purpose, opts.userId, opts.contentType);

  const headers: Record<string, string> = { 'Content-Type': opts.contentType };
  // Public files never change once uploaded (the name is random), so browsers and the CDN may keep them for a year.
  if (rule.bucket === 'media') headers['Cache-Control'] = 'public, max-age=31536000, immutable';

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: opts.contentType, CacheControl: headers['Cache-Control'] }),
    { expiresIn: UPLOAD_TTL_SECONDS, signableHeaders: new Set(['content-type', ...(headers['Cache-Control'] ? ['cache-control'] : [])]) },
  );

  const reference = rule.bucket === 'kyc' ? privateReference(key) : `${publicBase()}/${key}`;
  return { provider: 'r2', purpose, uploadUrl, method: 'PUT', headers, key, reference, expiresInSeconds: UPLOAD_TTL_SECONDS, maxBytes: maxUploadBytes() };
}

/** A short-lived link to view one private file. */
export async function signedViewUrl(kind: BucketKind, key: string, ttl = VIEW_TTL_SECONDS): Promise<string> {
  const { cfg, client } = need(kind);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: ttl });
}

export async function deleteObject(kind: BucketKind, key: string): Promise<void> {
  const { cfg, client } = need(kind);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/** Size and type of a stored file, or null when it does not exist. */
export async function headObject(kind: BucketKind, key: string): Promise<{ size: number; contentType?: string } | null> {
  const { cfg, client } = need(kind);
  try {
    const r = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType };
  } catch {
    return null;
  }
}

/** Uploads bytes from the server (used by the migration script). */
export async function putObject(kind: BucketKind, key: string, body: Buffer, contentType: string): Promise<void> {
  const { cfg, client } = need(kind);
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType,
    ...(kind === 'media' ? { CacheControl: 'public, max-age=31536000, immutable' } : {}),
  }));
}

/** `r2-kyc:kyc/<user>/<id>.jpg` -> its key, or null for any other value. */
export function parseKycReference(value: string): string | null {
  const m = /^r2-kyc:(kyc\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.[a-z0-9]{2,5})$/.exec(value ?? '');
  return m ? m[1] : null;
}

/** `r2-hr:hr/<owner>/<id>.pdf` -> its key, or null for any other value. */
export function parseHrReference(value: string): string | null {
  const m = /^r2-hr:(hr\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.[a-z0-9]{2,5})$/.exec(value ?? '');
  return m ? m[1] : null;
}

/** The key of a public file on our media domain, or null for any other URL. */
export function mediaKeyFromUrl(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const base = publicBase(env);
  if (!base || !url.startsWith(`${base}/`)) return null;
  const key = url.slice(base.length + 1).split('?')[0];
  return key && !key.includes('..') ? decodeURIComponent(key) : null;
}

/** If `url` is a signed view link we issued for the private bucket, the key it points at. */
export function kycKeyFromSignedUrl(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const cfg = bucketConfig('kyc', env);
  if (!cfg) return null;
  try {
    const u = new URL(url);
    const base = new URL(cfg.endpoint);
    if (u.host !== base.host) return null;
    const prefix = `/${cfg.bucket}/`;
    if (!u.pathname.startsWith(prefix)) return null;
    const key = decodeURIComponent(u.pathname.slice(prefix.length));
    return /^kyc\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.[a-z0-9]{2,5}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** Which content types a stored file may have, judged from where it lives (its first folder). */
export function allowedTypesForKey(key: string): readonly string[] {
  const folder = key.split('/')[0];
  const rule = Object.values(PURPOSES).find((p) => p.folder === folder);
  return rule ? rule.types : [];
}

export type StoredCheck = { ok: true; size: number } | { ok: false; reason: 'missing' | 'too-large' | 'wrong-type'; message: string };

/** Pure judgement of a stored file's size and type (separate from the network call so it can be tested). */
export function judgeStoredObject(key: string, info: { size: number; contentType?: string } | null, max = maxUploadBytes()): StoredCheck {
  if (!info) return { ok: false, reason: 'missing', message: 'The photo did not finish uploading. Please upload it again.' };
  if (info.size > max) return { ok: false, reason: 'too-large', message: `That photo is too large (the limit is ${Math.floor(max / 1048576)} MB). Please choose a smaller one.` };
  const type = (info.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!allowedTypesForKey(key).includes(type)) return { ok: false, reason: 'wrong-type', message: 'That file type is not allowed. Use a JPG, PNG or WebP image.' };
  return { ok: true, size: info.size };
}

/** Looks at a stored file; when it is too large or the wrong type it is deleted so it cannot be used. */
export async function verifyStoredObject(kind: BucketKind, key: string): Promise<StoredCheck> {
  const verdict = judgeStoredObject(key, await headObject(kind, key));
  if (!verdict.ok && verdict.reason !== 'missing') await deleteObject(kind, key).catch(() => undefined);
  return verdict;
}

export interface StoredObject { key: string; size: number; lastModified: Date }

/** Lists every file in a bucket (optionally under a prefix), page by page. */
export async function* listObjects(kind: BucketKind, prefix?: string): AsyncGenerator<StoredObject> {
  const { cfg, client } = need(kind);
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      if (o.Key) yield { key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) };
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

/** If `url` is a signed view link we issued for an HR document, the key it points at. */
export function hrKeyFromSignedUrl(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const cfg = bucketConfig('kyc', env);
  if (!cfg) return null;
  try {
    const u = new URL(url);
    if (u.host !== new URL(cfg.endpoint).host) return null;
    const prefix = `/${cfg.bucket}/`;
    if (!u.pathname.startsWith(prefix)) return null;
    const key = decodeURIComponent(u.pathname.slice(prefix.length));
    return /^hr\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.[a-z0-9]{2,5}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}
