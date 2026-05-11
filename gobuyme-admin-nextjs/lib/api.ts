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
    }
    throw new Error(json.message ?? 'Request failed');
  }

  return json as T;
}

export const api = {
  get:   <T>(path: string)               => request<T>(path),
  post:  <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del:   <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
};
