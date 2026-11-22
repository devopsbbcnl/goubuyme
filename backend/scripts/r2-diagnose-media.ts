/**
 * Works out why the public (media) bucket says "AccessDenied". Run it on the server:
 *
 *   npx ts-node scripts/r2-diagnose-media.ts
 *
 * It tries the R2_MEDIA_* key with a few harmless requests (list one file, write and delete a tiny test file) and tells you
 * which of the usual causes it is. It never prints any key or secret, only whether each request was allowed.
 */
import 'dotenv/config';
import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const env = process.env;
const account = env.R2_ACCOUNT_ID ?? '';
const mediaBucket = env.R2_MEDIA_BUCKET ?? '';
const kycBucket = env.R2_KYC_BUCKET ?? '';
const mKey = env.R2_MEDIA_ACCESS_KEY_ID ?? '';
const mSecret = env.R2_MEDIA_SECRET_ACCESS_KEY ?? '';
const kKey = env.R2_KYC_ACCESS_KEY_ID ?? '';

const endpoint = (eu: boolean) => `https://${account}${eu ? '.eu' : ''}.r2.cloudflarestorage.com`;
const client = (eu: boolean) => new S3Client({
  region: 'auto', endpoint: endpoint(eu), forcePathStyle: true,
  credentials: { accessKeyId: mKey, secretAccessKey: mSecret },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
});

async function can(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); console.log(`  allowed  ${label}`); return true; }
  catch (e) {
    const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    console.log(`  refused  ${label}  (${err.name ?? err.Code ?? 'error'}, HTTP ${err.$metadata?.httpStatusCode ?? '?'})`);
    return false;
  }
}

async function main() {
  if (!account || !mediaBucket || !mKey || !mSecret) { console.log('R2_ACCOUNT_ID, R2_MEDIA_BUCKET, R2_MEDIA_ACCESS_KEY_ID and R2_MEDIA_SECRET_ACCESS_KEY must all be set.'); process.exitCode = 1; return; }

  console.log(`Public bucket "${mediaBucket}" (settings say jurisdiction: ${env.R2_MEDIA_JURISDICTION ?? 'unset'})`);
  console.log(`Same key ID as the private bucket's key? ${mKey === kKey ? 'YES: the media lines hold the private bucket key' : 'no, they are different keys'}\n`);

  const list = (eu: boolean, bucket: string) => () => client(eu).send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));

  console.log('1. Can this key see the media bucket?');
  const defaultOk = await can(`list "${mediaBucket}" on the default endpoint`, list(false, mediaBucket));
  const euOk = await can(`list "${mediaBucket}" on the EU endpoint`, list(true, mediaBucket));

  console.log('\n2. Can this key see the PRIVATE bucket? (it should not)');
  const seesKyc = kycBucket
    ? (await can(`list "${kycBucket}" on the EU endpoint`, list(true, kycBucket))) || (await can(`list "${kycBucket}" on the default endpoint`, list(false, kycBucket)))
    : false;

  let canWrite = false;
  const eu = euOk && !defaultOk;
  if (defaultOk || euOk) {
    console.log('\n3. Can it write? (a tiny test file is written, then deleted)');
    const key = 'avatars/diagnose/test.txt';
    canWrite = await can('write a test file', () => client(eu).send(new PutObjectCommand({ Bucket: mediaBucket, Key: key, Body: Buffer.from('x'), ContentType: 'image/png' })));
    if (canWrite) await can('delete the test file', () => client(eu).send(new DeleteObjectCommand({ Bucket: mediaBucket, Key: key })));
  }

  console.log('\nResult');
  if (seesKyc) {
    console.log('  -> This key can see the PRIVATE bucket. The R2_MEDIA_* lines contain the private bucket\'s key pair.');
    console.log('     Create (or open) the token limited to the media bucket and put ITS Access Key ID and Secret on the R2_MEDIA_* lines.');
  } else if (!defaultOk && !euOk) {
    console.log('  -> This key cannot see the media bucket on either endpoint. Most likely causes:');
    console.log('     a) the token is limited to a different bucket (open it in R2 > Manage R2 API Tokens and check which bucket it lists),');
    console.log(`     b) the bucket name "${mediaBucket}" differs from the one in the dashboard (check spelling and hyphens),`);
    console.log('     c) the Access Key ID or Secret was copied wrongly (the secret is shown only once: make a new token if unsure).');
  } else if (eu && !defaultOk) {
    console.log('  -> The media bucket is reachable only on the EU endpoint: it was created in the EU jurisdiction.');
    console.log('     Set R2_MEDIA_JURISDICTION=eu in .env and restart the API.');
  } else if (defaultOk && !canWrite) {
    console.log('  -> The key can read the bucket but not write. The token is "Object Read only".');
    console.log('     Edit the token (or create a new one) with "Object Read & Write" limited to this bucket.');
  } else if (defaultOk && canWrite) {
    console.log('  -> The key works on the default endpoint, so R2_MEDIA_JURISDICTION must be "default" (it is: ' + (env.R2_MEDIA_JURISDICTION ?? 'unset') + ').');
    console.log('     Run scripts/r2-selftest.ts again; if it still fails, send me both outputs.');
  }
}

main().catch((e) => { console.error('Diagnostic failed:', e instanceof Error ? e.message : e); process.exitCode = 1; });
