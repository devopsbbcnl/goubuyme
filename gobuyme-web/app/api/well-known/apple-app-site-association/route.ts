import { NextResponse } from 'next/server';

// iOS universal links (served at /.well-known/apple-app-site-association via a rewrite in next.config.ts).
// Set APPLE_TEAM_ID to the Apple Developer Team ID. Until it is set this returns 404 and iOS opens links in Safari.
export async function GET() {
  const teamId = (process.env.APPLE_TEAM_ID ?? '').trim();
  if (!teamId) return new NextResponse(null, { status: 404 });

  return NextResponse.json(
    {
      applinks: {
        details: [{ appIDs: [`${teamId}.dev.bubblebarrel.gobuyme`], components: [{ '/': '/vendor/*' }] }],
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
