import { reportError } from '../services/errorReporting';

const BASE = '/api/proxy';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const json = await res.json().catch(() => ({ message: 'Network error' }));

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
    } else {
      reportError(new Error(json.message ?? 'Request failed'), {
        source: 'api',
        context: { url: `${BASE}${path}`, method: init.method ?? 'GET', status: res.status },
      });
    }
    // Keep per-field validation errors so a page can show which field was rejected.
    const err = new Error(json.message ?? 'Request failed') as Error & { fieldErrors?: { field: string; message: string }[] };
    if (Array.isArray(json.errors)) err.fieldErrors = json.errors;
    throw err;
  }

  return json as T;
}

export const api = {
  get:   <T>(path: string)               => request<T>(path),
  post:  <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:   <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  del:   <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
};
