import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:5000/api/v1';
const ACCESS_TTL = 15 * 60; // 15 minutes — matches JWT_ACCESS_EXPIRES_IN

export async function POST(req: NextRequest) {
  const body = await req.json();

  const upstream = await fetch(`${BACKEND}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await upstream.json();
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const { accessToken, refreshToken, user } = data.data as {
    accessToken: string;
    refreshToken: string;
    user: object;
  };

  const res = NextResponse.json({ status: 'success', data: { user } });

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };

  res.cookies.set('admin_token', accessToken, { ...cookieOpts, maxAge: ACCESS_TTL });
  res.cookies.set('admin_refresh', refreshToken, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60 });

  return res;
}
