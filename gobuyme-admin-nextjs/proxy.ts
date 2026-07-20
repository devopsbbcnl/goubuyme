import { NextRequest, NextResponse } from 'next/server';

// Server-side companion to app/(admin)/layout.tsx's client-side redirect.
// This only checks that a session cookie is present before the page renders —
// it does not re-validate the JWT (that still happens against the backend via
// /api/proxy on every real data request, same as before). Its job is closing
// the window where an unauthenticated visitor briefly sees the dashboard shell
// before the client-side check kicks in.
const PUBLIC_PATHS = new Set(['/login']);
const PUBLIC_PREFIXES = ['/rider/setup', '/vendor/setup', '/how-to', '/api'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has('admin_token') || req.cookies.has('admin_refresh');
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
