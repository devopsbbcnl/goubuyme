import type { NextConfig } from "next";

// Derive just the origin (scheme+host[:port]) from the API URL for connect-src —
// the env var itself includes a /api/v1 path suffix which CSP source lists don't use.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000').origin;
  } catch {
    return 'http://localhost:5000';
  }
})();
// CSP treats ws(s): as a distinct scheme from http(s): even for the same host — the
// socket.io client (live rider GPS) needs this explicitly or the browser blocks it.
const apiWsOrigin = apiOrigin.replace(/^http/, 'ws');

// Starter CSP: 'unsafe-inline' is kept for script-src/style-src because Next.js
// hydration and this app's inline `style={{...}}` usage rely on it, and moving to
// a nonce-based CSP is a larger follow-up, not a same-day change. Even so, this
// blocks loading of any externally-hosted script/frame/connection that isn't one
// of the origins this app actually uses (Google Sign-In, Cloudinary, the backend
// API) — the main gap it closes is arbitrary third-party script/asset injection.
const isDev = process.env.NODE_ENV !== 'production';

// 'unsafe-eval' is needed only in dev — React dev mode uses eval() for stack
// trace reconstruction; production React bundles never call eval().
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https://res.cloudinary.com https://images.pexels.com https://ui-avatars.com https://picsum.photos",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${apiOrigin} ${apiWsOrigin} https://accounts.google.com https://api.cloudinary.com https://www.google-analytics.com https://tiles.openfreemap.org`,
  "frame-src 'self' https://accounts.google.com",
  // MapLibre GL parses vector tiles off the main thread via a Worker constructed
  // from a Blob URL — 'self' alone doesn't cover blob: workers.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const nextConfig: NextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './lib/cloudinaryLoader.ts',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
