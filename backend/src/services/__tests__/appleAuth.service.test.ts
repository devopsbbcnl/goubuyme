import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verifyAppleIdentityToken, buildAppleClientSecret, AppleAuthError } from '../appleAuth.service';

const AUD = ['dev.bubblebarrel.gobuyme'];
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const resolveKey = async (kid: string) => (kid === 'k1' ? publicKey : null);

function token(claims: Record<string, unknown> = {}, opts: { key?: crypto.KeyObject; kid?: string; expiresIn?: string } = {}) {
  return jwt.sign(
    { sub: '001234.abc', email: 'Jane@Example.com', email_verified: 'true', ...claims },
    opts.key ?? privateKey,
    {
      algorithm: 'RS256',
      keyid: opts.kid ?? 'k1',
      issuer: 'https://appleid.apple.com',
      audience: AUD[0],
      expiresIn: (opts.expiresIn ?? '5m') as jwt.SignOptions['expiresIn'],
      ...(claims.iss ? { issuer: claims.iss as string } : {}),
    },
  );
}

const verify = (t: string) => verifyAppleIdentityToken(t, { audience: AUD, resolveKey });

describe('verifyAppleIdentityToken', () => {
  it('accepts a good token and lowercases the email', async () => {
    const id = await verify(token());
    expect(id).toEqual({ sub: '001234.abc', email: 'jane@example.com', emailVerified: true, isPrivateRelay: false });
  });

  it('reads boolean and string flags the way Apple sends them', async () => {
    const id = await verify(token({ email_verified: true, is_private_email: 'true' }));
    expect(id.emailVerified).toBe(true);
    expect(id.isPrivateRelay).toBe(true);
  });

  it('allows a token with no email', async () => {
    const t = jwt.sign({ sub: 'x' }, privateKey, {
      algorithm: 'RS256', keyid: 'k1', issuer: 'https://appleid.apple.com', audience: AUD[0], expiresIn: '5m',
    });
    expect((await verify(t)).email).toBeNull();
  });

  it('rejects a token signed with a different key', async () => {
    await expect(verify(token({}, { key: other.privateKey }))).rejects.toBeInstanceOf(AppleAuthError);
  });

  it('rejects an unknown signing key id', async () => {
    await expect(verify(token({}, { kid: 'nope' }))).rejects.toThrow('Unknown Apple signing key');
  });

  it('rejects the wrong audience (a token meant for another app)', async () => {
    await expect(
      verifyAppleIdentityToken(token(), { audience: ['com.someone.else'], resolveKey }),
    ).rejects.toBeInstanceOf(AppleAuthError);
  });

  it('rejects the wrong issuer', async () => {
    const t = jwt.sign({ sub: 'x' }, privateKey, {
      algorithm: 'RS256', keyid: 'k1', issuer: 'https://evil.example', audience: AUD[0], expiresIn: '5m',
    });
    await expect(verify(t)).rejects.toBeInstanceOf(AppleAuthError);
  });

  it('rejects an expired token', async () => {
    const t = jwt.sign({ sub: 'x', exp: Math.floor(Date.now() / 1000) - 60 }, privateKey, {
      algorithm: 'RS256', keyid: 'k1', issuer: 'https://appleid.apple.com', audience: AUD[0],
    });
    await expect(verify(t)).rejects.toBeInstanceOf(AppleAuthError);
  });

  it('rejects an unsigned (alg none) token', async () => {
    const t = jwt.sign({ sub: 'x' }, '', { algorithm: 'none', keyid: 'k1' } as jwt.SignOptions);
    await expect(verify(t)).rejects.toBeInstanceOf(AppleAuthError);
  });

  it('rejects garbage', async () => {
    await expect(verify('not-a-jwt')).rejects.toThrow('Malformed Apple token');
  });
});

describe('buildAppleClientSecret', () => {
  it('signs an ES256 secret for the team and bundle id', () => {
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.APPLE_TEAM_ID = 'TEAM123456';
    process.env.APPLE_KEY_ID = 'KEY1234567';
    process.env.APPLE_PRIVATE_KEY = (ec.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string).replace(/\n/g, '\\n');
    const secret = buildAppleClientSecret(1_800_000_000);
    const decoded = jwt.verify(secret, ec.publicKey, { algorithms: ['ES256'], ignoreExpiration: true }) as jwt.JwtPayload;
    expect(decoded.iss).toBe('TEAM123456');
    expect(decoded.sub).toBe('dev.bubblebarrel.gobuyme');
    expect(decoded.aud).toBe('https://appleid.apple.com');
    expect(jwt.decode(secret, { complete: true })!.header.kid).toBe('KEY1234567');
  });
});
