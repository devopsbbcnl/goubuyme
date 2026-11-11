import { NextResponse } from 'next/server';

// Android App Links verification (served at /.well-known/assetlinks.json via a rewrite in next.config.ts).
// Set ANDROID_SHA256_CERT_FINGERPRINTS to the app's signing certificate SHA-256 fingerprint(s), comma separated.
// With Play App Signing that is the "App signing key certificate" from Play Console, not the upload key.
// Until it is set this returns 404, so Android simply opens links in the browser instead of the app.
export async function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);
  if (fingerprints.length === 0) return new NextResponse(null, { status: 404 });

  return NextResponse.json(
    [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: 'dev.bubblebarrel.gobuyme', sha256_cert_fingerprints: fingerprints },
    }],
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
