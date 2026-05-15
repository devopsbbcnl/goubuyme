import axios, { AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'];
const isAuthEndpoint = (url?: string) => !!url && AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));

// Called when the refresh token itself is expired/missing — wires into AuthContext via _layout.tsx
let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (cb: () => void) => { onUnauthorized = cb; };

api.interceptors.request.use(async (config) => {
  if (isAuthEndpoint(config.url)) return config;

  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
type QueueEntry = { resolve: (token: string) => void; reject: (err: unknown) => void };
let pendingQueue: QueueEntry[] = [];

const flushQueue  = (token: string) => { pendingQueue.forEach(e => e.resolve(token)); pendingQueue = []; };
const rejectQueue = (err: unknown)  => { pendingQueue.forEach(e => e.reject(err));    pendingQueue = []; };

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };

    // Only refresh app-session 401s. Login/register 401s should reach the screen as form errors.
    if (err.response?.status !== 401 || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(err);
    }
    original._retry = true;

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
            resolve(api(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;
    try {
      const storedRefresh = await SecureStore.getItemAsync('refreshToken');
      if (!storedRefresh) throw new Error('no_refresh_token');

      // Use a plain axios call so it doesn't go through our interceptor again
      const { data } = await axios.post(
        `${BASE_URL}/auth/refresh`,
        { refreshToken: storedRefresh },
        { timeout: 8000 },
      );
      const { accessToken: newAccess, refreshToken: newRefresh } = data.data as {
        accessToken: string; refreshToken: string;
      };

      await SecureStore.setItemAsync('accessToken', newAccess);
      await SecureStore.setItemAsync('refreshToken', newRefresh);

      flushQueue(newAccess);
      original.headers = { ...original.headers, Authorization: `Bearer ${newAccess}` };
      return api(original);
    } catch (refreshErr) {
      rejectQueue(refreshErr);

      const refreshStatus = (refreshErr as any)?.response?.status;
      const isHardRejection =
        (refreshErr as Error)?.message === 'no_refresh_token' ||
        refreshStatus === 401 ||
        refreshStatus === 403;

      // Only force-logout when the server explicitly rejects the refresh token.
      // Network errors (no response) must NOT log the user out — a momentary
      // connectivity blip should not end the session.
      if (isHardRejection) {
        await Promise.all([
          SecureStore.deleteItemAsync('accessToken'),
          SecureStore.deleteItemAsync('refreshToken'),
          SecureStore.deleteItemAsync('userProfile'),
        ]);
        onUnauthorized?.();
      }

      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
