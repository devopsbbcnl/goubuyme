import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy so the browser never holds a JWT — mirrors the pattern
// already in use at gobuyme-admin-nextjs/app/api/proxy/[...path]/route.ts.
// Every authenticated call from services/api.ts goes through here; the access
// and refresh tokens live only in httpOnly cookies this route sets and reads.
const BACKEND = process.env.BACKEND_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
const ACCESS_TTL = 15 * 60; // 15 minutes — matches JWT_ACCESS_EXPIRES_IN
const REFRESH_TTL = 30 * 24 * 60 * 60;

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

async function callBackend(path: string, method: string, search: string, body: string | undefined, token: string | undefined) {
  return fetch(`${BACKEND}/${path}${search}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });
}

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join('/');
  const search = req.nextUrl.search;
  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const body = isBodyMethod ? await req.text() : undefined;

  const token = req.cookies.get('gbm_access')?.value;
  let upstream = await callBackend(path, req.method, search, body, token);

  // Access token missing or expired — try a silent refresh once, for any endpoint.
  let refreshedAccess: string | undefined;
  let refreshedRefresh: string | undefined;
  if (upstream.status === 401) {
    const refresh = req.cookies.get('gbm_refresh')?.value;
    if (refresh) {
      const r = await fetch(`${BACKEND}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (r.ok) {
        const refreshed = await r.json() as { data: { accessToken: string; refreshToken: string } };
        refreshedAccess = refreshed.data.accessToken;
        refreshedRefresh = refreshed.data.refreshToken;
        upstream = await callBackend(path, req.method, search, body, refreshedAccess);
      }
    }
  }

  const text = await upstream.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-JSON upstream response, pass through as text */ }

  // Endpoints that mint fresh tokens (login/register-verify/google/refresh) return
  // them in the JSON body — lift those into httpOnly cookies and strip them from
  // what reaches the browser instead of ever exposing them to client JS.
  let outBody = text;
  let newAccess = refreshedAccess;
  let newRefresh = refreshedRefresh;
  if (json && typeof json === 'object' && 'data' in json) {
    const data = (json as { data?: Record<string, unknown> }).data;
    if (data && typeof data === 'object' && typeof data.accessToken === 'string') {
      newAccess = data.accessToken;
      if (typeof data.refreshToken === 'string') newRefresh = data.refreshToken;
      const { accessToken: _a, refreshToken: _r, ...rest } = data;
      outBody = JSON.stringify({ ...(json as object), data: rest });
    }
  }

  const res = new NextResponse(outBody, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });

  if (newAccess) res.cookies.set('gbm_access', newAccess, { ...cookieOpts, maxAge: ACCESS_TTL });
  if (newRefresh) res.cookies.set('gbm_refresh', newRefresh, { ...cookieOpts, maxAge: REFRESH_TTL });

  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, (await params).path);
}
