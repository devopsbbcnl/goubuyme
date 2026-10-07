'use client';

// In-house product analytics — the web twin of gobuyme-mobile/services/analytics.ts.
// Events are queued in memory and POSTed in batches through the same-origin proxy, which
// attaches the user's identity server-side from the gbm_access cookie. Never put names,
// emails, phone numbers, addresses or free text in properties — ids, counts and amounts only.

export type AnalyticsEvent =
  | 'app_opened'
  | 'screen_viewed'
  | 'vendor_viewed'
  | 'search_performed'
  | 'item_added_to_cart'
  | 'checkout_started';

type Props = Record<string, string | number | boolean | null>;

interface QueuedEvent {
  name: AnalyticsEvent;
  occurredAt: string;
  sessionId: string;
  screen?: string;
  properties?: Props;
}

const ANON_ID_KEY = 'gbm_anon_id';
const OPT_OUT_KEY = 'gbm_analytics_opt_out';
const SESSION_KEY = 'gbm_session';
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 50;
const MAX_QUEUE = 500;
const SESSION_IDLE_MS = 30 * 60_000;

const randomId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

// Storage can throw (private mode, blocked site data) — analytics just degrades to per-page ids.
const read = (store: 'local' | 'session', key: string): string | null => {
  try { return (store === 'local' ? localStorage : sessionStorage).getItem(key); } catch { return null; }
};
const write = (store: 'local' | 'session', key: string, value: string | null): void => {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key); else s.setItem(key, value);
  } catch { /* ignore */ }
};

let queue: QueuedEvent[] = [];
let anonymousId: string | null = null;
let currentScreen: string | undefined;
let started = false;
let flushing = false;

const isBrowser = () => typeof window !== 'undefined';
const optedOut = () => read('local', OPT_OUT_KEY) === '1';

const getAnonymousId = (): string => {
  if (anonymousId) return anonymousId;
  anonymousId = read('local', ANON_ID_KEY) ?? randomId();
  write('local', ANON_ID_KEY, anonymousId);
  return anonymousId;
};

// A session survives page reloads and tabs-in-the-same-window, and rolls over after 30 idle minutes.
const getSessionId = (): string => {
  const now = Date.now();
  const raw = read('session', SESSION_KEY);
  let id: string | null = null;
  if (raw) {
    const [storedId, lastAt] = raw.split('|');
    if (storedId && now - Number(lastAt) < SESSION_IDLE_MS) id = storedId;
  }
  id = id ?? randomId();
  write('session', SESSION_KEY, `${id}|${now}`);
  return id;
};

/** Queue an event. Fire-and-forget — never throws, never awaits the network. */
export function track(name: AnalyticsEvent, properties?: Props): void {
  if (!isBrowser() || optedOut()) return;
  queue.push({ name, occurredAt: new Date().toISOString(), sessionId: getSessionId(), screen: currentScreen, properties });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= MAX_BATCH) void flush();
}

/** Record a page view. `screen` should be a route pattern (see normalizeScreen), not a raw URL. */
export function trackScreen(screen: string): void {
  if (screen === currentScreen) return;
  currentScreen = screen;
  track('screen_viewed');
}

export async function flush(): Promise<void> {
  if (!isBrowser() || flushing || queue.length === 0 || optedOut()) return;
  flushing = true;
  const batch = queue.slice(0, MAX_BATCH);
  try {
    const res = await fetch('/api/proxy/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      // keepalive lets the final flush on tab-hide complete after the page goes away.
      keepalive: true,
      body: JSON.stringify({ platform: 'WEB', anonymousId: getAnonymousId(), events: batch }),
    });
    // A 4xx (other than 429) means the batch itself is bad and retrying won't help — drop it.
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) queue = queue.slice(batch.length);
  } catch {
    // Network error — keep the batch for the next flush.
  } finally {
    flushing = false;
  }
}

export function setAnalyticsOptOut(value: boolean): void {
  write('local', OPT_OUT_KEY, value ? '1' : null);
  if (value) queue = [];
}

export const isAnalyticsOptedOut = (): boolean => isBrowser() && optedOut();

/** Call once on first client render. Starts periodic flushing and the tab-hide flush. */
export function initAnalytics(): void {
  if (!isBrowser() || started) return;
  started = true;
  track('app_opened');
  window.setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

// Dynamic route segments → placeholders, so screen names stay low-cardinality and id-free.
const VENDOR_DASHBOARD_PAGES = new Set(['menu', 'orders', 'profile', 'settings', 'earnings', 'promotions', 'documents']);
const ID_PREFIXES = new Set(['item', 'orders', 'help', 'cart']);

export function normalizeScreen(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'vendor' && parts[1] && !VENDOR_DASHBOARD_PAGES.has(parts[1])) parts[1] = '[id]';
  if (ID_PREFIXES.has(parts[0]) && parts[1] && parts[1] !== 'new') parts[1] = '[id]';
  return `/${parts.join('/')}`;
}
