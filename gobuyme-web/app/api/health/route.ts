import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
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
