import { NextResponse } from 'next/server';

// This route only ever runs server-side, so it should read the same
// runtime-resolved server var the proxy/auth routes use (BACKEND_API_URL),
// not NEXT_PUBLIC_API_URL — that one gets baked into the JS bundle at build
// time, which breaks the moment the build environment's "localhost" and the
// running container's "localhost" aren't the same machine (e.g. under
// Docker Compose, where the backend lives in a separate container).
const API_BASE = process.env.BACKEND_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
const BACKEND_HEALTH = API_BASE.replace(/\/api\/v1\/?$/, '') + '/health';

export async function GET() {
  try {
    const res = await fetch(BACKEND_HEALTH, { cache: 'no-store' });
    if (res.ok) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false }, { status: 502 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
