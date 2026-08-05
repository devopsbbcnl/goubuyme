import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { requirePublicEnv } from './env';

// Resolved independently (not imported from api.ts) to avoid a circular import —
// api.ts imports reportError from this module for its response interceptor.
const BASE_URL = requirePublicEnv('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL, 'http://localhost:5000/api/v1');

type ReportOptions = {
  source: 'api' | 'boundary' | 'google_signin' | 'global';
  context?: Record<string, unknown>;
};

// Simple in-memory de-dupe so retry loops (e.g. repeated socket reconnect
// failures) don't spam the backend with the same error over and over.
const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

const shouldReport = (key: string): boolean => {
  const now = Date.now();
  const last = recentlyReported.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  recentlyReported.set(key, now);
  return true;
};

/**
 * Fire-and-forget error report. Must never throw or delay the caller — a
 * failure to report an error must never itself become a user-visible error.
 */
export function reportError(error: unknown, options: ReportOptions): void {
  const err = error as { message?: string; stack?: string } | undefined;
  const message = err?.message ?? String(error) ?? 'Unknown error';
  const key = `${options.source}:${message}`;
  if (!shouldReport(key)) return;

  (async () => {
    try {
      // Raw axios, not the shared `api` instance — going through `api` here would
      // re-enter its response interceptor (which calls reportError) on failure.
      // Attach the access token if present so the backend can derive userId/role,
      // same as any other authenticated call — errors can also happen pre-login
      // (e.g. Google Sign-In), in which case there's simply no token to attach.
      const token = await SecureStore.getItemAsync('accessToken');

      await axios.post(
        `${BASE_URL}/errors`,
        {
          platform: 'MOBILE',
          source: options.source,
          message,
          stack: err?.stack,
          context: options.context,
          appVersion: Constants.expoConfig?.version,
          deviceInfo: { os: Platform.OS, osVersion: Platform.Version },
        },
        {
          timeout: 5000,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
    } catch {
      // Reporting failures are swallowed — never disrupt the user's flow.
    }
  })();
}
