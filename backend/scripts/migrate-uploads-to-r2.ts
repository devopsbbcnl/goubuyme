/**
 * Copies existing Cloudinary files to Cloudflare R2 and rewrites the addresses in the database.
 *
 *   npx ts-node scripts/migrate-uploads-to-r2.ts                      # dry run: counts what it would move, changes nothing
 *   npx ts-node scripts/migrate-uploads-to-r2.ts --apply              # copy, verify, rewrite database rows
 *   npx ts-node scripts/migrate-uploads-to-r2.ts --delete-originals   # later: delete Cloudinary copies that are verified in R2
 *
 * Where each file goes:
 *   - identity and verification photos (rider/vendor documents, business certificate, licences)  -> private bucket (kyc)
 *   - old private Cloudinary images (kyc/<user>/...)                                              -> private bucket (kyc)
 *   - every other image (logos, covers, menu photos, avatars, promo images, offers, media)       -> public bucket (media)
 * Public pictures larger than 1600px are shrunk while copying (never cropped); private ID photos are copied untouched.
 * HR tables (pwm_*) go to the private bucket under hr/legacy/ and are stored as r2-hr: references (never the public bucket); staff then see them as short-lived signed links.
 *
 * Safe to re-run: files already copied are found by content hash, and a row is only rewritten after its copy is verified.
 * Needs DATABASE_URL, the CLOUDINARY_* and R2_* variables (see .env.example). Writes migration-manifest.json beside the script.
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma from '../src/config/db';
import { putObject, headObject, isConfigured, publicBase, kycReference, hrReference } from '../src/services/objectStorage.service';
import { parsePrivateUrl, signKycUrl, deleteStoredImages } from '../src/services/kycStorage.service';
import { shrinkImage } from '../src/services/imageShrink.service';

const APPLY = process.argv.includes('--apply');
const DELETE_ORIGINALS = process.argv.includes('--delete-originals');
const MANIFEST = path.join(__dirname, 'migration-manifest.json');

const KYC_TABLES = new Set(['rider_documents', 'vendor_documents', 'vendor_business_verifications', 'vendor_licenses']);
const CLOUDINARY_URL = /https:\/\/res\.cloudinary\.com\/[^\s"'<>)\\]+/g;
const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };

type Manifest = Record<string, { to: string; bucket: 'kyc' | 'media'; key: string; bytes: number }>;
const manifest: Manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const save = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

const stats = { rows: 0, urls: 0, copied: 0, alreadyCopied: 0, failed: 0, shrunk: 0, bytesSaved: 0 };
const failures: string[] = [];

async function download(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  const priv = parsePrivateUrl(url);
  const target = priv ? ((await signKycUrl(url)) as string) : url;
  const res = await fetch(target);
  if (!res.ok) return null;
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  return { body: Buffer.from(await res.arrayBuffer()), contentType };
}

/** Copies one Cloudinary file and returns the value to store in its place, or null if it could not be moved. */
async function migrateOne(url: string, table: string): Promise<string | null> {
  const known = manifest[url];
  if (known) { stats.alreadyCopied++; return known.to; }

  const priv = parsePrivateUrl(url);
  const isHr = table.startsWith('pwm_');
  const toKyc = KYC_TABLES.has(table) || isHr || !!priv;
  if (!APPLY) return '(dry run)';

  const file = await download(url);
  if (!file) { failures.push(`${table}: could not download ${url}`); stats.failed++; return null; }
  // Public pictures that were never shrunk (old avatars, logos, covers, promos) are shrunk to the display limit on the way
  // in. Private ID documents are copied byte for byte: they must stay exactly as submitted and legible.
  let body = file.body;
  let contentType = file.contentType;
  if (!toKyc) {
    const small = await shrinkImage(file.body, file.contentType);
    if (small.changed) { stats.shrunk++; stats.bytesSaved += file.body.length - small.body.length; body = small.body; contentType = small.contentType; }
  }
  const ext = EXT_BY_TYPE[contentType] ?? (url.match(/\.([a-z0-9]{3,4})(?:\?|$)/i)?.[1]?.toLowerCase() ?? 'jpg');
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 32);

  // Private files keep their owner folder when they have one (kyc/<user>/<id>), otherwise go under kyc/legacy.
  const key = isHr ? `hr/legacy/${hash}.${ext}` : toKyc ? (priv?.publicId.startsWith('kyc/') ? `${priv.publicId}.${ext}` : `kyc/legacy/${hash}.${ext}`) : `migrated/${hash}.${ext}`;
  const bucket = toKyc ? 'kyc' : 'media';

  await putObject(bucket, key, body, contentType || 'application/octet-stream');
  const check = await headObject(bucket, key);
  if (!check || check.size !== body.length) { failures.push(`${table}: copy not verified for ${url}`); stats.failed++; return null; }

  const to = isHr ? hrReference(key) : toKyc ? kycReference(key) : `${publicBase()}/${key}`;
  manifest[url] = { to, bucket, key, bytes: body.length };
  save();
  stats.copied++;
  return to;
}

async function main() {
  if (!DELETE_ORIGINALS && APPLY && !(isConfigured('kyc') && isConfigured('media'))) {
    throw new Error('R2 is not configured: set the R2_* variables first.');
  }

  if (DELETE_ORIGINALS) {
    const urls: string[] = [];
    for (const [from, m] of Object.entries(manifest)) {
      const ok = await headObject(m.bucket, m.key);
      if (ok && ok.size === m.bytes) urls.push(from);
      else console.warn('NOT deleting (copy missing or changed in R2):', from);
    }
    // Only delete originals that no database row still points at.
    const stillUsed = new Set<string>();
    const cols = await textColumns();
    for (const c of cols) {
      const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(`SELECT "${c.column}" AS v FROM "${c.table}" WHERE "${c.column}" LIKE '%res.cloudinary.com%'`);
      for (const r of rows) for (const u of String(r.v).match(CLOUDINARY_URL) ?? []) stillUsed.add(u);
    }
    const safe = urls.filter((u) => !stillUsed.has(u));
    console.log(`${urls.length} verified copies, ${urls.length - safe.length} still referenced in the database (kept), ${safe.length} to delete from Cloudinary.`);
    const removed = await deleteStoredImages(safe);
    console.log(`Deleted ${removed} file(s) from Cloudinary.`);
    return;
  }

  console.log(APPLY ? 'APPLYING: copying files and rewriting rows' : 'DRY RUN (add --apply to copy and rewrite)');
  const cols = await textColumns();

  for (const { table, column } of cols) {
    const rows = await prisma.$queryRawUnsafe<{ id: string; v: string }[]>(
      `SELECT "id"::text AS id, "${column}" AS v FROM "${table}" WHERE "${column}" LIKE '%res.cloudinary.com%'`,
    ).catch(() => null);
    if (!rows || rows.length === 0) continue;


    console.log(`${table}.${column}: ${rows.length} row(s)`);
    for (const row of rows) {
      stats.rows++;
      let next = row.v;
      for (const url of new Set(row.v.match(CLOUDINARY_URL) ?? [])) {
        stats.urls++;
        const to = await migrateOne(url, table);
        if (to && APPLY) next = next.split(url).join(to);
      }
      if (APPLY && next !== row.v) {
        await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $1 WHERE "id"::text = $2`, next, row.id);
      }
    }
  }

  // JSON columns are only reported (rewriting them safely needs a human look).
  const jsonCols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('json','jsonb') AND table_name NOT LIKE '\\_prisma%'`,
  );
  const jsonHits: string[] = [];
  for (const c of jsonCols) {
    const n = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${c.table_name}" WHERE "${c.column_name}"::text LIKE '%res.cloudinary.com%'`).catch(() => [{ n: BigInt(0) }]);
    if (Number(n[0].n) > 0) jsonHits.push(`${c.table_name}.${c.column_name} (${n[0].n})`);
  }

  console.log('\n--- Summary ---');
  console.log({ ...stats, megabytesSavedByShrinking: Math.round(stats.bytesSaved / 1048576) });
  if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));

  if (jsonHits.length) console.log('JSON columns that still mention Cloudinary (check by hand):\n  ' + jsonHits.join('\n  '));
  if (!APPLY) console.log('\nDry run only: nothing was copied or changed.');
}

async function textColumns(): Promise<{ table: string; column: string }[]> {
  const r = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT c.table_name, c.column_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.data_type IN ('text','character varying')
       AND c.table_name <> '_prisma_migrations'
       AND EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.table_name AND k.column_name = 'id')
     ORDER BY c.table_name, c.column_name`,
  );
  return r.map((x) => ({ table: x.table_name, column: x.column_name }));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
