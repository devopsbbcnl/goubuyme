import { NextRequest, NextResponse } from 'next/server';

// Forwards the public careers and pre-boarding calls to the backend. No admin cookie is needed or sent;
// the pre-boarding session token (if any) is passed through as the bearer token.
const BACKEND = process.env.BACKEND_API_URL ?? 'http://localhost:5000/api/v1';

async function forward(req: NextRequest, path: string[]) {
  const isBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const auth = req.headers.get('authorization');
  const upstream = await fetch(`${BACKEND}/pwm-public/${path.join('/')}${req.nextUrl.search}`, {
    method: req.method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), 'X-Forwarded-For': req.headers.get('x-forwarded-for') ?? '' },
    ...(isBody ? { body: await req.text() } : {}),
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ status: 'error', message: 'Service unavailable. Please try again.' }, { status: 503 });
  return new NextResponse(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return forward(req, (await params).path); }
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) { return forward(req, (await params).path); }
