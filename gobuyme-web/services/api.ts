'use client';

import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

const api = axios.create({ baseURL: BASE, withCredentials: false });

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

api.interceptors.request.use(cfg => {
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('gbm_access');
    if (t && cfg.headers) cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('gbm_refresh');
        if (!refresh) throw new Error('no refresh');
        const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken: refresh });
        localStorage.setItem('gbm_access', data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('gbm_access');
        localStorage.removeItem('gbm_refresh');
        localStorage.removeItem('gbm_user');
        onUnauthorized?.();
      }
    }
    return Promise.reject(err);
  }
);

export default api;
