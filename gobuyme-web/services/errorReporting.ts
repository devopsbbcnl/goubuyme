'use client';

import axios from 'axios';

type ReportOptions = {
  source: 'api' | 'boundary' | 'global';
  context?: Record<string, unknown>;
};

// Simple in-memory de-dupe so repeated failures (e.g. a broken effect re-firing)
// don't spam the backend with the same error over and over.
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
 * Fire-and-forget error report. Must never throw — a failure to report an
 * error must never itself become a user-visible error.
 */
export function reportError(error: unknown, options: ReportOptions): void {
  const err = error as { message?: string; stack?: string } | undefined;
  const message = err?.message ?? String(error) ?? 'Unknown error';
  const key = `${options.source}:${message}`;
  if (!shouldReport(key)) return;

  // Raw axios to the proxy route (not the shared `api` instance) — going through
  // `api` here would re-enter its response interceptor (which calls reportError)
  // on failure. The proxy attaches the user's identity server-side from the
  // gbm_access cookie, same as any other authenticated call.
  axios
    .post(
      '/api/proxy/errors',
      {
        platform: 'WEB',
        source: options.source,
        message,
        stack: err?.stack,
        context: options.context,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
      { withCredentials: true, timeout: 5000 },
    )
    .catch(() => {
      // Reporting failures are swallowed — never disrupt the user's flow.
    });
}
