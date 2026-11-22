import { maxUploadBytes, DEFAULT_MAX_UPLOAD_BYTES, judgeStoredObject, allowedTypesForKey, createUploadTicket } from '../objectStorage.service';
import { uploadTargets } from '../uploadVerification.service';
import { judgeObject, extractReferencedKeys } from '../storageSweep.service';

const MB = 1024 * 1024;
const NOW = new Date('2026-11-22T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const ENV = {
  R2_ACCOUNT_ID: 'acct', R2_KYC_BUCKET: 'k', R2_KYC_ACCESS_KEY_ID: 'a', R2_KYC_SECRET_ACCESS_KEY: 'b',
  R2_MEDIA_BUCKET: 'm', R2_MEDIA_ACCESS_KEY_ID: 'a', R2_MEDIA_SECRET_ACCESS_KEY: 'b', R2_MEDIA_PUBLIC_URL: 'https://ifenkili.gobuyme.shop',
} as unknown as NodeJS.ProcessEnv;

describe('maxUploadBytes', () => {
  it('defaults to 15 MB', () => {
    expect(maxUploadBytes({} as NodeJS.ProcessEnv)).toBe(15 * MB);
    expect(DEFAULT_MAX_UPLOAD_BYTES).toBe(15 * MB);
  });
  it('can be changed, but not below 1 MB or to nonsense', () => {
    expect(maxUploadBytes({ UPLOAD_MAX_BYTES: String(20 * MB) } as NodeJS.ProcessEnv)).toBe(20 * MB);
    expect(maxUploadBytes({ UPLOAD_MAX_BYTES: '1000' } as NodeJS.ProcessEnv)).toBe(15 * MB);
    expect(maxUploadBytes({ UPLOAD_MAX_BYTES: 'lots' } as NodeJS.ProcessEnv)).toBe(15 * MB);
  });
  it('is the limit told to apps in every ticket', async () => {
    Object.assign(process.env, ENV);
    const t = await createUploadTicket({ purpose: 'avatar', userId: 'u', role: 'CUSTOMER', contentType: 'image/jpeg' });
    expect(t.maxBytes).toBe(maxUploadBytes());
  });
});

describe('allowedTypesForKey', () => {
  it('follows the folder the file lives in', () => {
    expect(allowedTypesForKey('kyc/u/x.jpg')).not.toContain('image/gif');
    expect(allowedTypesForKey('library/u/x.gif')).toContain('image/gif');
    expect(allowedTypesForKey('avatars/u/x.png')).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(allowedTypesForKey('mystery/u/x.png')).toEqual([]);
  });
});

describe('judgeStoredObject (save-time check)', () => {
  const key = 'avatars/u/x.jpg';
  it('accepts a normal photo', () => {
    expect(judgeStoredObject(key, { size: 900_000, contentType: 'image/jpeg' }).ok).toBe(true);
  });
  it('rejects a missing file', () => {
    const v = judgeStoredObject(key, null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('missing');
  });
  it('rejects a file over the limit and says the limit', () => {
    const v = judgeStoredObject(key, { size: 16 * MB, contentType: 'image/jpeg' });
    expect(v.ok).toBe(false);
    if (!v.ok) { expect(v.reason).toBe('too-large'); expect(v.message).toContain('15 MB'); }
  });
  it('allows a file exactly at the limit', () => {
    expect(judgeStoredObject(key, { size: 15 * MB, contentType: 'image/png' }).ok).toBe(true);
  });
  it('rejects the wrong type, including HTML pretending to be an image', () => {
    for (const t of ['text/html', 'application/pdf', 'image/svg+xml', undefined]) {
      const v = judgeStoredObject(key, { size: 1000, contentType: t });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe('wrong-type');
    }
  });
  it('reads the type without charset parameters', () => {
    expect(judgeStoredObject(key, { size: 1000, contentType: 'image/webp; charset=binary' }).ok).toBe(true);
  });
  it('honours a custom limit', () => {
    expect(judgeStoredObject(key, { size: 6 * MB, contentType: 'image/jpeg' }, 5 * MB).ok).toBe(false);
  });
});

describe('uploadTargets', () => {
  it('picks out our own private and public files and ignores everything else', () => {
    const t = uploadTargets([
      'r2-kyc:kyc/u1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg',
      'https://ifenkili.gobuyme.shop/logos/u1/a.png',
      'https://res.cloudinary.com/x/image/upload/old.jpg',
      'https://evil.example/a.png',
      null, undefined, '',
      'https://ifenkili.gobuyme.shop/logos/u1/a.png',
    ], ENV);
    expect(t).toEqual([
      { kind: 'kyc', key: 'kyc/u1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg' },
      { kind: 'media', key: 'logos/u1/a.png' },
    ]);
  });
});

describe('judgeObject (nightly clean-up)', () => {
  const rules = { now: NOW, maxBytes: 15 * MB, orphanAgeHours: 48 };
  const refs = new Set(['avatars/u/used.jpg']);
  const obj = (key: string, size: number, h: number) => ({ key, size, lastModified: hoursAgo(h) });

  it('keeps files that the database uses', () => {
    expect(judgeObject('media', obj('avatars/u/used.jpg', 500_000, 500), refs, rules)).toBe('keep');
  });
  it('removes unused files only after 48 hours', () => {
    expect(judgeObject('media', obj('avatars/u/stray.jpg', 500_000, 47), refs, rules)).toBe('keep');
    expect(judgeObject('media', obj('avatars/u/stray.jpg', 500_000, 49), refs, rules)).toBe('orphan');
  });
  it('removes oversize files after one hour, but not one being saved right now', () => {
    expect(judgeObject('media', obj('avatars/u/used.jpg', 20 * MB, 0.5), refs, rules)).toBe('keep');
    expect(judgeObject('media', obj('avatars/u/used.jpg', 20 * MB, 2), refs, rules)).toBe('oversize');
  });
  it('never touches migrated files, legacy ID photos or unknown folders', () => {
    expect(judgeObject('media', obj('migrated/abc.jpg', 1000, 9999), refs, rules)).toBe('protected');
    expect(judgeObject('kyc', obj('kyc/legacy/abc.jpg', 1000, 9999), refs, rules)).toBe('protected');
    expect(judgeObject('media', obj('backups/db.dump', 99 * MB, 9999), refs, rules)).toBe('protected');
    expect(judgeObject('media', obj('kyc/u/x.jpg', 1000, 9999), refs, rules)).toBe('protected');
  });
  it('treats private ID photos in the private bucket like any other upload', () => {
    expect(judgeObject('kyc', obj('kyc/u/new.jpg', 1000, 100), new Set(), rules)).toBe('orphan');
    expect(judgeObject('kyc', obj('kyc/u/new.jpg', 1000, 100), new Set(['kyc/u/new.jpg']), rules)).toBe('keep');
  });
});

describe('extractReferencedKeys', () => {
  const base = 'https://ifenkili.gobuyme.shop';
  it('finds public addresses and private references in plain text and JSON', () => {
    const text = `{"logo":"${base}/logos/u1/a.png","docs":["r2-kyc:kyc/u1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg"]} see ${base}/menu/u1/b%20c.webp?x=1`;
    expect(extractReferencedKeys(text, base).sort()).toEqual([
      'kyc/u1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg', 'logos/u1/a.png', 'menu/u1/b c.webp',
    ].sort());
  });
  it('ignores other hosts and Cloudinary addresses', () => {
    expect(extractReferencedKeys('https://res.cloudinary.com/x/image/upload/a.jpg https://other.example/logos/u/a.png', base)).toEqual([]);
  });
  it('still finds private references when no public address is set', () => {
    expect(extractReferencedKeys('r2-kyc:kyc/u/abc.jpg', '')).toEqual(['kyc/u/abc.jpg']);
  });
});
