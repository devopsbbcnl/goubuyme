import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:5000/api/v1';
const ACCESS_TTL = 15 * 60;
const REFRESH_TTL = 30 * 24 * 60 * 60;

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

async function resolveToken(req: NextRequest): Promise<{ token: string; newAccess?: string; newRefresh?: string } | null> {
  const access = req.cookies.get('admin_token')?.value;
  if (access) return { token: access };

  const refresh = req.cookies.get('admin_refresh')?.value;
  if (!refresh) return null;

  const refreshRes = await fetch(`${BACKEND}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!refreshRes.ok) return null;

  const { data } = await refreshRes.json() as { data: { accessToken: string; refreshToken: string } };
  return { token: data.accessToken, newAccess: data.accessToken, newRefresh: data.refreshToken };
}

export async function GET(req: NextRequest) {
  const result = await resolveToken(req);
  if (!result) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { token, newAccess, newRefresh } = result;

  const upstream = await fetch(`${BACKEND}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await upstream.json();
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = NextResponse.json(data);
  if (newAccess) res.cookies.set('admin_token', newAccess, { ...cookieOpts, maxAge: ACCESS_TTL });
  if (newRefresh) res.cookies.set('admin_refresh', newRefresh, { ...cookieOpts, maxAge: REFRESH_TTL });
  return res;
}
