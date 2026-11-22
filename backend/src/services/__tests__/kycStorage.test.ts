import {
  createUploadTicket, canonicalKycUrl, signKycUrl, signKycFields, parsePrivateUrl, isPrivateKycUrl,
} from '../kycStorage.service';

const CLOUD = 'democloud';
const PRIVATE = `https://res.cloudinary.com/${CLOUD}/image/authenticated/v1700000000/kyc/user-1/abc123.jpg`;
const LEGACY = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/gobuyme/old.jpg`;

beforeAll(() => {
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = '123456789012345';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
});

describe('createUploadTicket', () => {
  it('signs a private upload scoped to the caller folder', () => {
    const t = createUploadTicket('user-1', new Date('2026-11-22T10:00:00Z'));
    expect(t.type).toBe('authenticated');
    expect(t.folder).toBe('kyc/user-1');
    expect(t.timestamp).toBe(Math.floor(new Date('2026-11-22T10:00:00Z').getTime() / 1000));
    expect(t.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(JSON.stringify(t)).not.toContain('test-secret');
  });

  it('gives different signatures for different users', () => {
    const now = new Date('2026-11-22T10:00:00Z');
    expect(createUploadTicket('a', now).signature).not.toBe(createUploadTicket('b', now).signature);
  });
});

describe('parsePrivateUrl / isPrivateKycUrl', () => {
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
  it('keeps private urls without version and legacy public urls unchanged', () => {
    expect(canonicalKycUrl(PRIVATE, 'user-1')).toBe(`https://res.cloudinary.com/${CLOUD}/image/authenticated/kyc/user-1/abc123.jpg`);
    expect(canonicalKycUrl(LEGACY, 'user-1')).toBe(LEGACY);
  });
  it('turns a signed download link back into the stored form', () => {
    const signed = signKycUrl(PRIVATE) as string;
    expect(canonicalKycUrl(signed, 'user-1')).toBe(`https://res.cloudinary.com/${CLOUD}/image/authenticated/kyc/user-1/abc123.jpg`);
  });
  it('rejects someone else\'s private file, other sites and other folders', () => {
    expect(canonicalKycUrl(PRIVATE, 'user-2')).toBeNull();
    expect(canonicalKycUrl('https://evil.example/x.jpg', 'user-1')).toBeNull();
    expect(canonicalKycUrl(PRIVATE.replace('kyc/user-1', 'menu/user-1'), 'user-1')).toBeNull();
  });
  it('lets an admin store any user\'s private file (no owner check)', () => {
    expect(canonicalKycUrl(PRIVATE)).not.toBeNull();
  });
  it('treats empty as cleared and undefined as untouched', () => {
    expect(canonicalKycUrl('')).toBeNull();
    expect(canonicalKycUrl(null)).toBeNull();
    expect(canonicalKycUrl(undefined)).toBeUndefined();
  });
});

describe('signKycUrl / signKycFields', () => {
  it('returns an expiring download link for private files', () => {
    const now = new Date('2026-11-22T10:00:00Z');
    const link = signKycUrl(PRIVATE, now) as string;
    const q = new URL(link).searchParams;
    expect(link.startsWith(`https://api.cloudinary.com/v1_1/${CLOUD}/image/download`)).toBe(true);
    expect(q.get('public_id')).toBe('kyc/user-1/abc123');
    expect(q.get('type')).toBe('authenticated');
    expect(Number(q.get('expires_at'))).toBe(Math.floor(now.getTime() / 1000) + 15 * 60);
    expect(link).not.toContain('test-secret');
  });
  it('passes legacy, empty and missing values through', () => {
    expect(signKycUrl(LEGACY)).toBe(LEGACY);
    expect(signKycUrl(null)).toBeNull();
    expect(signKycUrl(undefined)).toBeUndefined();
  });
  it('signs only the named fields', () => {
    const row = { id: 'x', selfieUrl: PRIVATE, ninImageUrl: LEGACY, ninNumber: '123' };
    const out = signKycFields(row, ['selfieUrl', 'ninImageUrl']);
    expect(out.selfieUrl).toContain('/image/download');
    expect(out.ninImageUrl).toBe(LEGACY);
    expect(out.ninNumber).toBe('123');
    expect(row.selfieUrl).toBe(PRIVATE);
  });
});
