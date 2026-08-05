'use client';

type ReportOptions = {
  source: 'api' | 'boundary' | 'global';
  context?: Record<string, unknown>;
};

// Simple in-memory de-dupe so repeated failures don't spam the backend with
// the same error over and over.
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

  // Raw fetch to the proxy route (not lib/api.ts's `api` helper) — going through
  // it here would re-enter its error path on failure. The proxy attaches the
  // admin's identity server-side from the session cookie, same as any other
  // authenticated call.
  fetch('/api/proxy/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'ADMIN',
      source: options.source,
      message,
      stack: err?.stack,
      context: options.context,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }),
  }).catch(() => {
    // Reporting failures are swallowed — never disrupt the user's flow.
  });
}
