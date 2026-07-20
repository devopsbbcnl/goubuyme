'use client';

import axios from 'axios';

// Same-origin proxy — see app/api/proxy/[...path]/route.ts. The browser never
// holds an access/refresh token; those live in httpOnly cookies the proxy sets
// and reads server-side, and are sent automatically since this is same-origin.
const api = axios.create({ baseURL: '/api/proxy', withCredentials: true });

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

api.interceptors.response.use(
  r => r,
  async err => {
    if (err.response?.status === 401) {
      // The proxy already tried a silent refresh server-side before returning
      // this 401, so a session-ending sign-out is the correct next step here.
      onUnauthorized?.();
    }
    return Promise.reject(err);
  }
);

export default api;
