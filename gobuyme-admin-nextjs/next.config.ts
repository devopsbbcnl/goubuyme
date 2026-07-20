import type { NextConfig } from 'next';

// Starter CSP: 'unsafe-inline' is kept for script-src/style-src because Next.js
// hydration and this app's inline `style={{...}}` usage rely on it, and moving to
// a nonce-based CSP is a larger follow-up, not a same-day change. Even so, this
// blocks loading of any externally-hosted script/frame/connection that isn't one
// of the origins this app actually uses — admin auth stays same-origin via
// /api/proxy, so the only external destination is the direct-to-Cloudinary upload.
const csp = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https://res.cloudinary.com https://images.unsplash.com",
	"font-src 'self' data:",
	"connect-src 'self' https://api.cloudinary.com",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'",
].join('; ');

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'images.unsplash.com' },
		],
	},
	turbopack: {
		root: process.cwd(),
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
					{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
				],
			},
		];
	},
};

export default nextConfig;
