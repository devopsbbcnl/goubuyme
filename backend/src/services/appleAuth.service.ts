import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Sign in with Apple, server side:
//  - verify the identity token the app gets from Apple (signature, issuer, audience, expiry)
//  - exchange the authorization code for a refresh token, and revoke it again when the account
//    is deleted (App Store guideline 5.1.1(v)).
// Revocation and code exchange need an Apple key (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY);
// sign-in itself only needs the bundle id and works without them.

const APPLE_ISSUER = 'https://appleid.apple.com';
const KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
const REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;

/** The app's bundle id is the token audience for native sign-in. Comma-separate to allow several. */
export const appleClientIds = (): string[] =>
  (process.env.APPLE_CLIENT_IDS || 'dev.bubblebarrel.gobuyme')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export interface AppleIdentity {
  /** Apple's stable id for this person and this developer team. */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** True for a "Hide My Email" relay address (privaterelay.appleid.com). */
  isPrivateRelay: boolean;
}

export class AppleAuthError extends Error {}

export type AppleKeyResolver = (kid: string) => Promise<crypto.KeyObject | null>;

let keyCache: { keys: Array<crypto.JsonWebKey & { kid?: string }>; fetchedAt: number } | null = null;
const KEY_TTL_MS = 60 * 60 * 1000;

async function loadKeys(force: boolean) {
  if (!force && keyCache && Date.now() - keyCache.fetchedAt < KEY_TTL_MS) return keyCache.keys;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new AppleAuthError(`Apple keys request failed (${res.status}).`);
  const body = (await res.json()) as { keys?: Array<crypto.JsonWebKey & { kid?: string }> };
  keyCache = { keys: body.keys ?? [], fetchedAt: Date.now() };
  return keyCache.keys;
}

const defaultResolver: AppleKeyResolver = async (kid) => {
  // Apple rotates keys: a kid we have not seen means refetch once before giving up.
  for (const force of [false, true]) {
    const jwk = (await loadKeys(force)).find((k) => k.kid === kid);
    if (jwk) return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }
  return null;
};

export async function verifyAppleIdentityToken(
  identityToken: string,
  opts: { audience?: string[]; resolveKey?: AppleKeyResolver } = {},
): Promise<AppleIdentity> {
  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded && typeof decoded === 'object' ? decoded.header.kid : undefined;
  if (!kid) throw new AppleAuthError('Malformed Apple token.');

  const key = await (opts.resolveKey ?? defaultResolver)(kid);
  if (!key) throw new AppleAuthError('Unknown Apple signing key.');

  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(identityToken, key, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: (opts.audience ?? appleClientIds()) as [string, ...string[]],
    }) as jwt.JwtPayload;
  } catch {
    throw new AppleAuthError('Invalid or expired Apple token.');
  }
  if (!claims.sub) throw new AppleAuthError('Apple token has no subject.');

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  return {
    sub: claims.sub,
    email,
    // Apple sends this as a boolean or the string "true".
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    isPrivateRelay: claims.is_private_email === true || claims.is_private_email === 'true',
  };
}

export const appleRevocationConfigured = (): boolean =>
  Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);

/** The ES256 "client secret" Apple wants on token and revoke calls. */
export function buildAppleClientSecret(now = Math.floor(Date.now() / 1000)): string {
  const clientId = appleClientIds()[0];
  return jwt.sign(
    { iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 15 * 60, aud: APPLE_ISSUER, sub: clientId },
    (process.env.APPLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
    { algorithm: 'ES256', keyid: process.env.APPLE_KEY_ID },
  );
}

async function postForm(url: string, form: Record<string, string>) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

/** Swap the one-time authorization code from the app for a refresh token. Null if not configured or Apple refuses. */
export async function exchangeAppleAuthorizationCode(code: string): Promise<string | null> {
  if (!appleRevocationConfigured()) return null;
  const res = await postForm(TOKEN_URL, {
    client_id: appleClientIds()[0],
    client_secret: buildAppleClientSecret(),
    code,
    grant_type: 'authorization_code',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { refresh_token?: string };
  return body.refresh_token ?? null;
}

/** End the person's Apple grant for this app. Returns whether Apple accepted it. */
export async function revokeAppleRefreshToken(refreshToken: string): Promise<boolean> {
  if (!appleRevocationConfigured()) return false;
  const res = await postForm(REVOKE_URL, {
    client_id: appleClientIds()[0],
    client_secret: buildAppleClientSecret(),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  return res.ok;
}
