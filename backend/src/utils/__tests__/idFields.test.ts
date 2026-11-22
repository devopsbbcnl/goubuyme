import { encryptId, readId, maskId, isEncryptedField } from '../crypto';

beforeAll(() => { process.env.MFA_ENCRYPTION_KEY = 'a'.repeat(64); });

describe('identity number storage', () => {
  it('round-trips and never stores the plain number', () => {
    const stored = encryptId(' 12345678901 ');
    expect(stored).not.toContain('12345678901');
    expect(isEncryptedField(stored)).toBe(true);
    expect(readId(stored)).toBe('12345678901');
  });
  it('gives a different ciphertext each time', () => {
    expect(encryptId('12345678901')).not.toBe(encryptId('12345678901'));
  });
  it('returns rows saved before encryption unchanged', () => {
    expect(readId('12345678901')).toBe('12345678901');
    expect(readId(null)).toBe('');
  });
  it('masks all but the last four characters', () => {
    expect(maskId('12345678901')).toBe('*******8901');
    expect(maskId('AB12')).toBe('***AB12'.slice(0, 0) + '***' + 'AB12');
    expect(maskId('')).toBe('');
  });
});
