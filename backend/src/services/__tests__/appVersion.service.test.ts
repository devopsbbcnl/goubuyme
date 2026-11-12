import { compareVersions, parseReleaseNotes, VERSION_PATTERN } from '../appVersion.service';

describe('parseReleaseNotes', () => {
  it('gives one entry per line and drops typed bullets and blank lines', () => {
    expect(parseReleaseNotes('- Share your store\r\n\n• Fixed a crash\n  * Faster search  \nPlain line')).toEqual([
      'Share your store',
      'Fixed a crash',
      'Faster search',
      'Plain line',
    ]);
  });

  it('gives nothing when no notes are written', () => {
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes(' \n - \n')).toEqual([]);
  });
});

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
  });

  it('treats equal versions as equal', () => {
    expect(compareVersions('2.0.1', '2.0.1')).toBe(0);
  });

  it('orders on major before minor before patch', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });
});

describe('VERSION_PATTERN', () => {
  it('accepts x.y.z only', () => {
    expect(VERSION_PATTERN.test('1.2.3')).toBe(true);
    expect(VERSION_PATTERN.test('1.2')).toBe(false);
    expect(VERSION_PATTERN.test('v1.2.3')).toBe(false);
    expect(VERSION_PATTERN.test('1.2.3-beta')).toBe(false);
  });
});
