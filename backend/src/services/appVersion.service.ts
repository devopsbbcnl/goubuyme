import { getPlatformSettings } from './settings.service';

export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const parts = (v: string) => v.split('.').map((p) => Number.parseInt(p, 10) || 0);

// x.y.z compared by number, so 1.10.0 is newer than 1.9.0.
export const compareVersions = (a: string, b: string): number => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

export const RELEASE_NOTES_MAX_LENGTH = 1000;

// Release notes are typed one change per line. A leading "-", "*" or "•" is
// dropped so the app can draw its own bullets; blank lines are ignored.
export const parseReleaseNotes = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);

// What the phone app asks at launch: the oldest version still allowed, the newest
// one out, what changed in it, and where to get it. The app does the comparing
// (it knows its own version); the server only says what the platform wants.
export const versionPolicy = async (platform: 'android' | 'ios') => {
  const s = await getPlatformSettings();
  const storeUrl = platform === 'ios' ? s.storeUrlIos : s.storeUrlAndroid;
  return {
    min: s.minAppVersion,
    latest: s.latestAppVersion,
    storeUrl: storeUrl || null,
    notes: parseReleaseNotes(s.appReleaseNotes),
  };
};
