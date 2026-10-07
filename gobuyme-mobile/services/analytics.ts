import axios from 'axios';
import { AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requirePublicEnv } from './env';

// In-house product analytics. Events are queued in memory and POSTed in batches to
// /events; the backend attaches userId/role from the access token, so screens never
// pass identity. Never put names, emails, phone numbers, addresses or free text in
// properties — ids, counts and amounts only.
//
// Resolved independently (not imported from api.ts) for the same reason as
// errorReporting.ts — analytics must never re-enter api.ts's interceptors.
const BASE_URL = requirePublicEnv('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL, 'http://localhost:5000/api/v1');

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
const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 50;
const MAX_QUEUE = 500; // drop oldest beyond this — a long offline stretch must not grow memory forever
const SESSION_IDLE_MS = 30 * 60_000;

const randomId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

let queue: QueuedEvent[] = [];
let anonymousId: string | null = null;
let optedOut = false;
let sessionId = randomId();
let lastActiveAt = Date.now();
let currentScreen: string | undefined;
let flushing = false;
let started = false;

const touchSession = () => {
  const now = Date.now();
  if (now - lastActiveAt > SESSION_IDLE_MS) sessionId = randomId();
  lastActiveAt = now;
};

/** Queue an event. Fire-and-forget — never throws, never awaits the network. */
export function track(name: AnalyticsEvent, properties?: Props): void {
  if (optedOut) return;
  touchSession();
  queue.push({ name, occurredAt: new Date().toISOString(), sessionId, screen: currentScreen, properties });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= MAX_BATCH) void flush();
}

/** Record a screen view. `screen` should be a route pattern, not a URL with ids in it. */
export function trackScreen(screen: string): void {
  if (screen === currentScreen) return;
  currentScreen = screen;
  track('screen_viewed');
}

export async function flush(): Promise<void> {
  if (flushing || queue.length === 0 || optedOut) return;
  flushing = true;
  const batch = queue.slice(0, MAX_BATCH);
  try {
    const token = await SecureStore.getItemAsync('accessToken');
    await axios.post(
      `${BASE_URL}/events`,
      { platform: 'MOBILE', anonymousId: anonymousId ?? undefined, appVersion: Constants.expoConfig?.version, events: batch },
      { timeout: 8000, headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    );
    queue = queue.slice(batch.length);
  } catch (err) {
    // A 4xx means the batch itself is bad (validation) and retrying won't help — drop it.
    // Network errors and 5xx/429 keep the batch for the next flush.
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status && status >= 400 && status < 500 && status !== 429) queue = queue.slice(batch.length);
  } finally {
    flushing = false;
  }
}

/** Mirrors the user's analytics consent locally so nothing is even queued once they opt out. */
export async function setAnalyticsOptOut(value: boolean): Promise<void> {
  optedOut = value;
  if (value) queue = [];
  try {
    if (value) await AsyncStorage.setItem(OPT_OUT_KEY, '1');
    else await AsyncStorage.removeItem(OPT_OUT_KEY);
  } catch { /* best effort */ }
}

export const isAnalyticsOptedOut = (): boolean => optedOut;

/** Call once at app start. Loads the install id + local consent, then starts periodic flushing. */
export async function initAnalytics(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const [storedId, storedOptOut] = await Promise.all([
      AsyncStorage.getItem(ANON_ID_KEY),
      AsyncStorage.getItem(OPT_OUT_KEY),
    ]);
    optedOut = storedOptOut === '1';
    if (optedOut) queue = []; // anything tracked before consent finished loading
    anonymousId = storedId ?? randomId();
    if (!storedId) await AsyncStorage.setItem(ANON_ID_KEY, anonymousId);
  } catch {
    anonymousId = anonymousId ?? randomId();
  }

  track('app_opened');
  setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      const wasIdle = Date.now() - lastActiveAt > SESSION_IDLE_MS;
      touchSession();
      if (wasIdle) track('app_opened');
    } else {
      // Backgrounding is the last reliable moment before the OS may kill the process.
      void flush();
    }
  });
}
