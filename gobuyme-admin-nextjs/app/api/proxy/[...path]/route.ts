import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:5000/api/v1';
const ACCESS_TTL = 15 * 60;

async function getOrRefreshToken(req: NextRequest): Promise<{ token: string; newAccess?: string } | null> {
  const access = req.cookies.get('admin_token')?.value;
  if (access) return { token: access };

  const refresh = req.cookies.get('admin_refresh')?.value;
  if (!refresh) return null;

  const refreshRes = await fetch(`${BACKEND}/auth/refresh-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!refreshRes.ok) return null;

  const { data } = await refreshRes.json() as { data: { accessToken: string } };
  return { token: data.accessToken, newAccess: data.accessToken };
}

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  const tokenResult = await getOrRefreshToken(req);
  if (!tokenResult) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { token, newAccess } = tokenResult;
  const backendPath = pathSegments.join('/');
  const search = req.nextUrl.search;
  const url = `${BACKEND}/${backendPath}${search}`;

  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const body = isBodyMethod ? await req.text() : undefined;

  const upstream = await fetch(url, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body } : {}),
  });

  const responseData = await upstream.text();
  const res = new NextResponse(responseData, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });

  if (newAccess) {
    res.cookies.set('admin_token', newAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TTL,
    });
  }

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
