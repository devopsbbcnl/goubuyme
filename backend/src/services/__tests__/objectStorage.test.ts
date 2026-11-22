import {
  bucketConfig, isConfigured, buildKey, createUploadTicket, signedViewUrl, parseKycReference, kycReference,
  kycKeyFromSignedUrl, mediaKeyFromUrl, publicBase, UploadNotAllowedError, StorageNotConfiguredError, PURPOSES,
} from '../objectStorage.service';

const ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_KYC_BUCKET: 'gobuyme-kyc', R2_KYC_ACCESS_KEY_ID: 'kycAccessKey', R2_KYC_SECRET_ACCESS_KEY: 'kyc-secret-value', R2_KYC_JURISDICTION: 'eu',
  R2_MEDIA_BUCKET: 'gobuyme-media', R2_MEDIA_ACCESS_KEY_ID: 'mediaAccessKey', R2_MEDIA_SECRET_ACCESS_KEY: 'media-secret-value', R2_MEDIA_JURISDICTION: 'eu',
  R2_MEDIA_PUBLIC_URL: 'https://ifenkili.gobuyme.shop/',
};
const saved = { ...process.env };
beforeEach(() => { Object.assign(process.env, ENV); });
afterAll(() => { process.env = saved; });

describe('bucketConfig', () => {
  it('uses the EU endpoint for EU-jurisdiction buckets and the default one otherwise', () => {
    expect(bucketConfig('kyc', ENV as NodeJS.ProcessEnv)?.endpoint).toBe('https://acct123.eu.r2.cloudflarestorage.com');
    expect(bucketConfig('media', { ...ENV, R2_MEDIA_JURISDICTION: 'default' } as NodeJS.ProcessEnv)?.endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
  });
  it('returns null when any setting is missing', () => {
    expect(bucketConfig('kyc', { ...ENV, R2_KYC_SECRET_ACCESS_KEY: '' } as NodeJS.ProcessEnv)).toBeNull();
    expect(isConfigured('media', {} as NodeJS.ProcessEnv)).toBe(false);
  });
  it('trims the trailing slash of the public address', () => {
    expect(publicBase(ENV as NodeJS.ProcessEnv)).toBe('https://ifenkili.gobuyme.shop');
  });
});

describe('buildKey', () => {
  it('puts the file in the caller\'s own folder with a random name', () => {
    const a = buildKey('kyc', 'user-1', 'image/jpeg');
    const b = buildKey('kyc', 'user-1', 'image/jpeg');
    expect(a).toMatch(/^kyc\/user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b);
    expect(buildKey('avatar', 'u', 'image/png', 'fixed')).toBe('avatars/u/fixed.png');
  });
  it('rejects content types it has no file extension for', () => {
    expect(() => buildKey('kyc', 'u', 'text/html')).toThrow(UploadNotAllowedError);
    expect(() => buildKey('kyc', 'u', 'application/zip')).toThrow(UploadNotAllowedError);
    // Which types a purpose accepts is decided in createUploadTicket (an ID photo refuses a PDF; HR documents allow it).
    expect(buildKey('hr', 'u', 'application/pdf', 'fixed')).toBe('hr/u/fixed.pdf');
  });
});

describe('createUploadTicket', () => {
  it('signs a 5-minute PUT for a private ID photo and returns a private reference', async () => {
    const t = await createUploadTicket({ purpose: 'kyc', userId: 'user-1', role: 'RIDER', contentType: 'image/jpeg' });
    const u = new URL(t.uploadUrl);
    expect(u.host).toBe('acct123.eu.r2.cloudflarestorage.com');
    expect(u.pathname.startsWith('/gobuyme-kyc/kyc/user-1/')).toBe(true);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('X-Amz-SignedHeaders') ?? '').toContain('content-type');
    expect(t.method).toBe('PUT');
    expect(t.headers['Content-Type']).toBe('image/jpeg');
    expect(t.reference).toBe(`r2-kyc:${t.key}`);
    expect(JSON.stringify(t)).not.toContain('kyc-secret-value');
  });
  it('gives public media a permanent public address and a long cache header', async () => {
    const t = await createUploadTicket({ purpose: 'logo', userId: 'vendor-1', role: 'VENDOR', contentType: 'image/webp' });
    expect(t.reference).toBe(`https://ifenkili.gobuyme.shop/${t.key}`);
    expect(t.key).toMatch(/^logos\/vendor-1\/.+\.webp$/);
    expect(t.headers['Cache-Control']).toContain('immutable');
    expect(new URL(t.uploadUrl).pathname.startsWith('/gobuyme-media/logos/vendor-1/')).toBe(true);
  });
  it('enforces who may upload what', async () => {
    await expect(createUploadTicket({ purpose: 'kyc', userId: 'c1', role: 'CUSTOMER', contentType: 'image/jpeg' })).rejects.toThrow(UploadNotAllowedError);
    await expect(createUploadTicket({ purpose: 'menu', userId: 'r1', role: 'RIDER', contentType: 'image/jpeg' })).rejects.toThrow(UploadNotAllowedError);
    await expect(createUploadTicket({ purpose: 'avatar', userId: 'c1', role: 'CUSTOMER', contentType: 'image/jpeg' })).resolves.toBeTruthy();
    await expect(createUploadTicket({ purpose: 'nonsense', userId: 'c1', role: 'CUSTOMER', contentType: 'image/jpeg' })).rejects.toThrow(UploadNotAllowedError);
  });
  it('refuses file types that are not allowed for the purpose', async () => {
    await expect(createUploadTicket({ purpose: 'kyc', userId: 'u', role: 'RIDER', contentType: 'image/gif' })).rejects.toThrow(UploadNotAllowedError);
    expect(PURPOSES.media.types).toContain('image/gif');
  });
  it('says so when storage is not configured', async () => {
    const keep = process.env.R2_KYC_BUCKET;
    delete process.env.R2_KYC_BUCKET;
    await expect(createUploadTicket({ purpose: 'kyc', userId: 'u', role: 'RIDER', contentType: 'image/jpeg' })).rejects.toThrow(StorageNotConfiguredError);
    process.env.R2_KYC_BUCKET = keep;
  });
});

describe('references and links', () => {
  const key = 'kyc/user-1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg';
  it('parses only well-formed private references', () => {
    expect(parseKycReference(kycReference(key))).toBe(key);
    expect(parseKycReference('r2-kyc:../../etc/passwd')).toBeNull();
    expect(parseKycReference('r2-kyc:avatars/u/x.jpg')).toBeNull();
    expect(parseKycReference('https://evil.example/x.jpg')).toBeNull();
  });
  it('signs a 15-minute view link and recovers the key from it', async () => {
    const link = await signedViewUrl('kyc', key);
    expect(new URL(link).searchParams.get('X-Amz-Expires')).toBe('900');
    expect(kycKeyFromSignedUrl(link)).toBe(key);
    expect(kycKeyFromSignedUrl('https://acct123.eu.r2.cloudflarestorage.com/other-bucket/' + key)).toBeNull();
    expect(kycKeyFromSignedUrl('https://evil.example/gobuyme-kyc/' + key)).toBeNull();
  });
  it('recognises our public media files only', () => {
    expect(mediaKeyFromUrl('https://ifenkili.gobuyme.shop/logos/u/a.png')).toBe('logos/u/a.png');
    expect(mediaKeyFromUrl('https://ifenkili.gobuyme.shop/../secret')).toBeNull();
    expect(mediaKeyFromUrl('https://other.example/logos/u/a.png')).toBeNull();
  });
});
