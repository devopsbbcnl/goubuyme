import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

// The version gate. The API says the oldest version still allowed and the newest
// one out; this phone compares against the version baked into its own build.
export interface VersionPolicy {
  min: string;
  latest: string;
  storeUrl: string | null;
}

export type UpdateState = 'ok' | 'available' | 'required';

export const installedVersion = Constants.expoConfig?.version ?? '0.0.0';

// x.y.z by number, so 1.10.0 is newer than 1.9.0. Missing or non-numeric parts count as 0.
const parts = (v: string) => v.split('.').map(p => Number.parseInt(p, 10) || 0);

export function isOlder(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export function updateState(policy: VersionPolicy, installed = installedVersion): UpdateState {
  if (isOlder(installed, policy.min)) return 'required';
  if (isOlder(installed, policy.latest)) return 'available';
  return 'ok';
}

export const fetchVersionPolicy = async (): Promise<VersionPolicy> => {
  const res = await api.get('/app-version', { params: { platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  return res.data.data as VersionPolicy;
};
