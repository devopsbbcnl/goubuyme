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

// Starter CSP: 'unsafe-inline' is kept for script-src/style-src because Next.js
// hydration and this app's inline `style={{...}}` usage rely on it, and moving to
// a nonce-based CSP is a larger follow-up, not a same-day change. Even so, this
// blocks loading of any externally-hosted script/frame/connection that isn't one
// of the origins this app actually uses (Google Sign-In, Cloudinary, the backend
// API) — the main gap it closes is arbitrary third-party script/asset injection.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://res.cloudinary.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://accounts.google.com`,
  "frame-src 'self' https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const nextConfig: NextConfig = {
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
