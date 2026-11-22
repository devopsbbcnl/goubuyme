import { canonicalKycUrl, signKycUrl, signKycFields, parsePrivateUrl, isPrivateKycUrl } from '../kycStorage.service';

const CLOUD = 'democloud';
const PRIVATE = `https://res.cloudinary.com/${CLOUD}/image/authenticated/v1700000000/kyc/user-1/abc123.jpg`;
const LEGACY = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/gobuyme/old.jpg`;
const R2KEY = 'kyc/user-1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg';
const R2REF = `r2-kyc:${R2KEY}`;

beforeAll(() => {
  Object.assign(process.env, {
    CLOUDINARY_CLOUD_NAME: CLOUD, CLOUDINARY_API_KEY: '123456789012345', CLOUDINARY_API_SECRET: 'test-secret',
    R2_ACCOUNT_ID: 'acct123', R2_KYC_BUCKET: 'gobuyme-kyc', R2_KYC_ACCESS_KEY_ID: 'k', R2_KYC_SECRET_ACCESS_KEY: 'kyc-secret-value', R2_KYC_JURISDICTION: 'eu',
  });
});

describe('parsePrivateUrl / isPrivateKycUrl (old Cloudinary private images)', () => {
  it('reads public id and format, ignoring version and signature segments', () => {
    expect(parsePrivateUrl(PRIVATE)).toEqual({ publicId: 'kyc/user-1/abc123', format: 'jpg' });
    expect(parsePrivateUrl(PRIVATE.replace('/authenticated/', '/authenticated/s--AbCdEfGh--/')))
      .toEqual({ publicId: 'kyc/user-1/abc123', format: 'jpg' });
  });
  it('ignores other clouds, public uploads and junk', () => {
    expect(parsePrivateUrl(LEGACY)).toBeNull();
    expect(parsePrivateUrl(PRIVATE.replace(CLOUD, 'othercloud'))).toBeNull();
    expect(parsePrivateUrl('')).toBeNull();
    expect(isPrivateKycUrl(PRIVATE)).toBe(true);
    expect(isPrivateKycUrl(LEGACY)).toBe(false);
  });
});

describe('canonicalKycUrl', () => {
  it('accepts a private R2 reference for its owner and nobody else', () => {
    expect(canonicalKycUrl(R2REF, 'user-1')).toBe(R2REF);
    expect(canonicalKycUrl(R2REF, 'user-2')).toBeNull();
    expect(canonicalKycUrl(R2REF)).toBe(R2REF);
  });
  it('turns a signed view link echoed back by an app into the stored reference', async () => {
    const link = (await signKycUrl(R2REF)) as string;
    expect(link).toContain('X-Amz-Signature');
    expect(canonicalKycUrl(link, 'user-1')).toBe(R2REF);
    expect(canonicalKycUrl(link, 'user-2')).toBeNull();
  });
  it('still accepts old Cloudinary images, private without version and public unchanged', () => {
    expect(canonicalKycUrl(PRIVATE, 'user-1')).toBe(`https://res.cloudinary.com/${CLOUD}/image/authenticated/kyc/user-1/abc123.jpg`);
    expect(canonicalKycUrl(LEGACY, 'user-1')).toBe(LEGACY);
    expect(canonicalKycUrl(PRIVATE, 'user-2')).toBeNull();
  });
  it('rejects other sites, other folders and malformed references', () => {
    expect(canonicalKycUrl('https://evil.example/x.jpg', 'user-1')).toBeNull();
    expect(canonicalKycUrl(PRIVATE.replace('kyc/user-1', 'menu/user-1'), 'user-1')).toBeNull();
    expect(canonicalKycUrl('r2-kyc:kyc/user-1/../../x.jpg', 'user-1')).toBeNull();
    expect(canonicalKycUrl('r2-kyc:avatars/user-1/x.jpg', 'user-1')).toBeNull();
  });
  it('treats empty as cleared and undefined as untouched', () => {
    expect(canonicalKycUrl('')).toBeNull();
    expect(canonicalKycUrl(null)).toBeNull();
    expect(canonicalKycUrl(undefined)).toBeUndefined();
  });
});

describe('signKycUrl / signKycFields', () => {
  it('returns a 15-minute signed link for R2 files and never exposes the secret', async () => {
    const link = (await signKycUrl(R2REF)) as string;
    const u = new URL(link);
    expect(u.host).toBe('acct123.eu.r2.cloudflarestorage.com');
    expect(u.pathname).toBe(`/gobuyme-kyc/${R2KEY}`);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(link).not.toContain('kyc-secret-value');
  });
  it('returns an expiring download link for old Cloudinary-private files', async () => {
    const now = new Date('2026-11-22T10:00:00Z');
    const link = (await signKycUrl(PRIVATE, now)) as string;
    const q = new URL(link).searchParams;
    expect(link.startsWith(`https://api.cloudinary.com/v1_1/${CLOUD}/image/download`)).toBe(true);
    expect(Number(q.get('expires_at'))).toBe(Math.floor(now.getTime() / 1000) + 15 * 60);
    expect(link).not.toContain('test-secret');
  });
  it('passes legacy public, empty and missing values through', async () => {
    expect(await signKycUrl(LEGACY)).toBe(LEGACY);
    expect(await signKycUrl(null)).toBeNull();
    expect(await signKycUrl(undefined)).toBeUndefined();
  });
  it('signs only the named fields', async () => {
    const row = { id: 'x', selfieUrl: R2REF, ninImageUrl: LEGACY, ninNumber: '123' };
    const out = await signKycFields(row, ['selfieUrl', 'ninImageUrl']);
    expect(out.selfieUrl).toContain('X-Amz-Signature');
    expect(out.ninImageUrl).toBe(LEGACY);
    expect(out.ninNumber).toBe('123');
    expect(row.selfieUrl).toBe(R2REF);
  });
});
