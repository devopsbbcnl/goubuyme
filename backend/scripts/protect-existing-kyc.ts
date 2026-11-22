/**
 * One-off clean-up for identity data saved before private KYC storage (NDPA register G2, G3).
 *
 *   npx ts-node scripts/protect-existing-kyc.ts            # dry run: only reports what it would change
 *   npx ts-node scripts/protect-existing-kyc.ts --apply    # does it
 *
 * 1. Encrypts any rider NIN / vendor ID number still saved as plain text.
 * 2. Moves identity photos that sit at public Cloudinary addresses to private storage
 *    (renames them into `kyc/legacy/...` with type "authenticated") and updates the record.
 *
 * Safe to run twice. Needs DATABASE_URL, MFA_ENCRYPTION_KEY and the CLOUDINARY_* variables.
 */
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '../src/config/db';
import { encryptId, isEncryptedField } from '../src/utils/crypto';
import { isLegacyPublicUrl } from '../src/services/kycStorage.service';

const APPLY = process.argv.includes('--apply');
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME ?? '';

cloudinary.config({ cloud_name: CLOUD, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });

let numbersDone = 0;
let photosMoved = 0;
let photosSkipped = 0;

/** Moves one public image to private storage and returns its new stored URL (or null if it could not). */
async function protect(url: string | null): Promise<string | null> {
  if (!url || !isLegacyPublicUrl(url)) return null;
  const m = /\/image\/upload\/(?:v\d+\/)?(.+)\.([A-Za-z0-9]+)$/.exec(url);
  if (!m || m[1].includes(',') || /^[a-z]_/.test(m[1])) { console.warn('  skipped (unusual URL shape):', url); photosSkipped++; return null; }
  const from = m[1];
  const to = `kyc/legacy/${from}`;
  photosMoved++;
  if (!APPLY) { console.log(`  would move ${from} -> ${to}`); return null; }
  try {
    await cloudinary.uploader.rename(from, to, { type: 'upload', to_type: 'authenticated', resource_type: 'image', overwrite: false });
  } catch (e) {
    console.warn('  could not move', from, (e as Error).message);
    photosSkipped++; photosMoved--;
    return null;
  }
  return `https://res.cloudinary.com/${CLOUD}/image/authenticated/${to}.${m[2]}`;
}

async function main() {
  console.log(APPLY ? 'APPLYING changes' : 'DRY RUN (add --apply to make changes)');

  for (const d of await prisma.riderDocument.findMany()) {
    const data: Record<string, string> = {};
    if (!isEncryptedField(d.ninNumber)) { data.ninNumber = encryptId(d.ninNumber); numbersDone++; }
    for (const f of ['ninImageUrl', 'selfieUrl', 'vehicleImageUrl'] as const) {
      const next = await protect(d[f]);
      if (next) data[f] = next;
    }
    if (APPLY && Object.keys(data).length) await prisma.riderDocument.update({ where: { id: d.id }, data });
  }

  for (const d of await prisma.vendorDocument.findMany()) {
    const data: Record<string, string> = {};
    if (!isEncryptedField(d.number)) { data.number = encryptId(d.number); numbersDone++; }
    for (const f of ['imageUrl', 'imageUrlBack', 'selfieUrl'] as const) {
      const next = await protect(d[f]);
      if (next) data[f] = next;
    }
    if (APPLY && Object.keys(data).length) await prisma.vendorDocument.update({ where: { id: d.id }, data });
  }

  for (const b of await prisma.vendorBusinessVerification.findMany()) {
    const next = await protect(b.cacImageUrl);
    if (APPLY && next) await prisma.vendorBusinessVerification.update({ where: { id: b.id }, data: { cacImageUrl: next } });
  }

  for (const l of await prisma.vendorLicense.findMany()) {
    const next = await protect(l.imageUrl);
    if (APPLY && next) await prisma.vendorLicense.update({ where: { id: l.id }, data: { imageUrl: next } });
  }

  console.log(`${APPLY ? 'Done' : 'Would change'}: ${numbersDone} identity number(s) encrypted, ${photosMoved} photo(s) moved to private storage, ${photosSkipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
