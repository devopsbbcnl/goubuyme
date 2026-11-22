import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

const ENCRYPTED_RE = /^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/;

/** True when the stored value is in the `iv:ciphertext:tag` form written by encryptSecret. */
export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && ENCRYPTED_RE.test(value);
}

/** Encrypts an identity number (NIN, licence or passport number) for storage. */
export function encryptId(plain: string): string {
  return encryptSecret(plain.trim());
}

/** Reads a stored identity number. Older rows saved before encryption was added are returned as they are. */
export function readId(stored: string | null | undefined): string {
  if (!stored) return '';
  return isEncryptedField(stored) ? decryptSecret(stored) : stored;
}

/** `*******1234`: enough for staff to recognise a number, not to copy it. */
export function maskId(plain: string | null | undefined): string {
  if (!plain) return '';
  const last = plain.slice(-4);
  return `${'*'.repeat(Math.max(plain.length - 4, 3))}${last}`;
}

export function decryptSecret(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format');
  const [ivHex, encryptedHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
