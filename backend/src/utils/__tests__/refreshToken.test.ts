import { hashRefreshToken, refreshTokenMatches } from '../generateToken';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.payload.signature';

describe('refresh token storage', () => {
  it('stores a hash, never the token itself', () => {
    const stored = hashRefreshToken(TOKEN);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toContain('payload');
  });
  it('accepts the right token against its hash', () => {
    expect(refreshTokenMatches(hashRefreshToken(TOKEN), TOKEN)).toBe(true);
  });
  it('rejects another token, an empty store and a hash used as the token', () => {
    expect(refreshTokenMatches(hashRefreshToken(TOKEN), TOKEN + 'x')).toBe(false);
    expect(refreshTokenMatches(null, TOKEN)).toBe(false);
    expect(refreshTokenMatches(hashRefreshToken(TOKEN), hashRefreshToken(TOKEN))).toBe(false);
  });
  it('still accepts a plain-text value saved before hashing was added', () => {
    expect(refreshTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(refreshTokenMatches(TOKEN, 'different')).toBe(false);
  });
});
