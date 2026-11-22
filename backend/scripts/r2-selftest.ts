/**
 * Checks that Cloudflare R2 is wired up correctly. Run it on the server (or locally) once the R2_* variables are set:
 *
 *   npx ts-node scripts/r2-selftest.ts
 *
 * It uploads a 1x1 test image to each bucket through the same signed-ticket path the apps use, then checks:
 *   private bucket: the file opens through a signed link, and the storage address refuses a request without a signature
 *                   (whether a bucket is public is a dashboard setting: the script reminds you to check it)
 *   public bucket:  the file is reachable at R2_MEDIA_PUBLIC_URL (your custom domain) with the long cache header
 * and deletes the test files again. Prints PASS or FAIL for each step; exits with an error if anything failed.
 */
import 'dotenv/config';
import {
  createUploadTicket, isConfigured, signedViewUrl, headObject, deleteObject, bucketConfig, publicBase, putObject, verifyStoredObject, maxUploadBytes,
} from '../src/services/objectStorage.service';
import { runStorageSweep } from '../src/services/storageSweep.service';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let failed = 0;
let mediaWorks = false;
/** The storage address (the S3 API) always refuses a request that carries no signature: 400, 401 or 403 are all correct. */
const refused = (status: number) => status >= 400 && status < 500;
const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => { failed++; console.log(`  FAIL  ${m}`); };

async function put(purpose: 'kyc' | 'avatar') {
  const t = await createUploadTicket({ purpose, userId: 'selftest', role: purpose === 'kyc' ? 'RIDER' : 'CUSTOMER', contentType: 'image/png' });
  const res = await fetch(t.uploadUrl, { method: t.method, headers: t.headers, body: PNG });
  return { t, res };
}

async function main() {
  console.log('R2 self-test');

  if (!isConfigured('kyc')) bad('private bucket settings are missing (R2_ACCOUNT_ID, R2_KYC_*)');
  else {
    console.log(`\nPrivate bucket "${bucketConfig('kyc')!.bucket}" at ${bucketConfig('kyc')!.endpoint}`);
    const { t, res } = await put('kyc');
    if (!res.ok) { bad(`upload refused: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); }
    else {
      ok('upload through a signed ticket works');
      const head = await headObject('kyc', t.key);
      head && head.size === PNG.length ? ok('file is stored with the right size') : bad('file not found after upload');

      const signed = await fetch(await signedViewUrl('kyc', t.key));
      signed.status === 200 ? ok('signed view link opens the file') : bad(`signed view link returned HTTP ${signed.status}`);

      const unsigned = await fetch(`${bucketConfig('kyc')!.endpoint}/${bucketConfig('kyc')!.bucket}/${t.key}`);
      refused(unsigned.status) ? ok(`the storage address refuses a request with no signature (HTTP ${unsigned.status})`) : bad(`an unsigned request returned HTTP ${unsigned.status}: unexpected, check the bucket`);

      await deleteObject('kyc', t.key);
      (await headObject('kyc', t.key)) === null ? ok('test file deleted') : bad('test file was not deleted');
    }
  }

  if (isConfigured('kyc')) {
    console.log('\nHR documents (private, PDF allowed)');
    const t = await createUploadTicket({ purpose: 'hr', userId: 'selftest', role: 'STAFF', contentType: 'application/pdf' });
    const res = await fetch(t.uploadUrl, { method: t.method, headers: t.headers, body: Buffer.from('%PDF-1.4\n%%EOF\n') });
    if (!res.ok) bad(`HR upload refused: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    else {
      ok('a PDF uploads through an HR ticket');
      t.reference.startsWith('r2-hr:hr/selftest/') ? ok('it is stored as a private HR reference') : bad(`unexpected reference ${t.reference}`);
      const view = await fetch(await signedViewUrl('kyc', t.key));
      view.status === 200 ? ok('the signed link opens it') : bad(`signed link returned HTTP ${view.status}`);
      const plain = await fetch(`${bucketConfig('kyc')!.endpoint}/${bucketConfig('kyc')!.bucket}/${t.key}`);
      refused(plain.status) ? ok(`the storage address refuses a request with no signature (HTTP ${plain.status})`) : bad(`an unsigned request returned HTTP ${plain.status}: unexpected, check the bucket`);
      await deleteObject('kyc', t.key);
    }
  }

  if (!isConfigured('media') || !publicBase()) bad('public bucket settings are missing (R2_MEDIA_*, R2_MEDIA_PUBLIC_URL)');
  else {
    console.log(`\nPublic bucket "${bucketConfig('media')!.bucket}", served from ${publicBase()}`);
    const { t, res } = await put('avatar');
    if (!res.ok) {
      bad(`upload refused: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      if (res.status === 403) {
        console.log('        HINT  AccessDenied means the signature was accepted but this key may not write to the bucket. Check that:');
        console.log(`              - R2_MEDIA_ACCESS_KEY_ID / R2_MEDIA_SECRET_ACCESS_KEY belong to a token with "Object Read & Write" limited to bucket "${bucketConfig('media')!.bucket}"`);
        console.log('                (not the key pair of the private bucket copied across, and not read-only);');
        console.log(`              - R2_MEDIA_JURISDICTION matches how the bucket was created: it is currently "${process.env.R2_MEDIA_JURISDICTION ?? '(unset)'}" so the endpoint is ${bucketConfig('media')!.endpoint}`);
        console.log('                (a bucket created without a jurisdiction needs "default"; an EU one needs "eu").');
      }
    } else {
      mediaWorks = true;
      ok('upload through a signed ticket works');
      const pub = await fetch(t.reference);
      if (pub.status === 200) {
        ok('file is reachable on your public domain');
        const cache = pub.headers.get('cache-control') ?? '';
        cache.includes('max-age') ? ok(`cache header present (${cache})`) : bad('no Cache-Control header on the public file');
      } else bad(`public address returned HTTP ${pub.status} (is the custom domain connected and Active?) ${t.reference}`);
      await deleteObject('media', t.key);
      (await headObject('media', t.key)) === null ? ok('test file deleted') : bad('test file was not deleted');
    }
  }

  if (mediaWorks) {
    console.log(`\nSave-time checks (limit ${Math.floor(maxUploadBytes() / 1048576)} MB)`);
    const goodKey = 'avatars/selftest/ok.png';
    await putObject('media', goodKey, PNG, 'image/png');
    const good = await verifyStoredObject('media', goodKey);
    good.ok ? ok('a normal image passes') : bad(`a normal image was rejected: ${good.message}`);
    await deleteObject('media', goodKey);

    const badKey = 'avatars/selftest/bad.html';
    await putObject('media', badKey, Buffer.from('<html></html>'), 'text/html');
    const wrong = await verifyStoredObject('media', badKey);
    !wrong.ok && wrong.reason === 'wrong-type' ? ok('a wrong-type file is rejected') : bad('a wrong-type file was accepted');
    (await headObject('media', badKey)) === null ? ok('the rejected file was deleted from storage') : bad('the rejected file is still in storage');
  }

  console.log('\nNightly clean-up (dry run, deletes nothing)');
  try {
    const sweep = await runStorageSweep({ deleteEnabled: false });
    if (sweep.aborted) console.log(`  NOTE  ${sweep.aborted}`);
    else ok(`scanned ${sweep.scanned} file(s); would remove ${sweep.oversize} oversize and ${sweep.orphans} unused`);
    sweep.examples.forEach((e) => console.log(`        ${e}`));
  } catch (e) {
    bad(`the clean-up could not run: ${e instanceof Error ? e.message : e}`);
  }

  console.log('\nBefore you rely on this, check in the Cloudflare dashboard (a script cannot see these):');
  console.log('  - "' + (bucketConfig('kyc')?.bucket ?? 'private bucket') + '": Public access is Disabled, no custom domain, r2.dev subdomain off.');
  console.log('  - the public bucket has the custom domain connected and Active, and r2.dev is off.');

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error('FAIL ', e instanceof Error ? e.message : e); process.exitCode = 1; });
