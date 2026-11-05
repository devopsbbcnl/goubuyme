'use client';

import axios from 'axios';
import { reportError } from './errorReporting';

// Same-origin proxy — see app/api/proxy/[...path]/route.ts. The browser never
// holds an access/refresh token; those live in httpOnly cookies the proxy sets
// and reads server-side, and are sent automatically since this is same-origin.
const api = axios.create({ baseURL: '/api/proxy', withCredentials: true });

// A vendor account can own several locations (main business + branches). The selected one is kept
// in localStorage and sent on vendor calls; the server falls back to the main business without it.
export const ACTIVE_LOCATION_KEY = 'gbm_active_vendor';
export const getActiveLocationId = (): string | null => {
  try { return window.localStorage.getItem(ACTIVE_LOCATION_KEY); } catch { return null; }
};
export const setActiveLocationId = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(ACTIVE_LOCATION_KEY, id);
    else window.localStorage.removeItem(ACTIVE_LOCATION_KEY);
    window.dispatchEvent(new CustomEvent('gbm:location', { detail: id }));
  } catch { /* storage unavailable: the choice just lasts until reload */ }
};

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined' && config.url?.startsWith('/vendors/me')) {
    const id = getActiveLocationId();
    if (id) config.headers.set('X-Vendor-Id', id);
  }
  return config;
});

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

api.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401) {
      // The proxy already tried a silent refresh server-side before returning
      // this 401, so a session-ending sign-out is the correct next step here.
      onUnauthorized?.();
    } else {
      reportError(err, {
        source: 'api',
        context: { url: err.config?.url, method: err.config?.method, status: err.response?.status },
      });
    }
    return Promise.reject(err);
  }
);

export default api;
