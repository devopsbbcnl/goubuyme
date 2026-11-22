import type { NextConfig } from 'next';

// Starter CSP: 'unsafe-inline' is kept for script-src/style-src because Next.js
// hydration and this app's inline `style={{...}}` usage rely on it, and moving to
// a nonce-based CSP is a larger follow-up, not a same-day change. Even so, this
// blocks loading of any externally-hosted script/frame/connection that isn't one
// of the origins this app actually uses — admin auth stays same-origin via
// /api/proxy, so the only external destination is the direct-to-Cloudinary upload.
// Public images come from our own storage domain; private ID photos open through short-lived signed links on
// Cloudflare R2's own hostname, and browsers upload to that hostname too. Nothing is uploaded to Cloudinary any more;
// its address stays allowed for viewing only, until the files that are still there have been moved.
const mediaOrigin = (() => {
	try {
		return new URL(process.env.NEXT_PUBLIC_MEDIA_URL ?? 'https://ifenkili.gobuyme.shop').origin;
	} catch {
		return 'https://ifenkili.gobuyme.shop';
	}
})();
const r2Hosts = 'https://*.r2.cloudflarestorage.com https://*.eu.r2.cloudflarestorage.com';

const csp = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	`img-src 'self' data: ${mediaOrigin} ${r2Hosts} https://res.cloudinary.com https://images.unsplash.com https://images.pexels.com https://ui-avatars.com https://picsum.photos`,
	"font-src 'self' data:",
	`connect-src 'self' ${r2Hosts}`,
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'",
].join('; ');

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'images.unsplash.com' },
			{ protocol: 'https', hostname: 'images.pexels.com' },
			{ protocol: 'https', hostname: 'ui-avatars.com' },
			{ protocol: 'https', hostname: 'picsum.photos' },
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
