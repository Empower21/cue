import { NextResponse } from 'next/server';
import { getUpdaterManifest } from '@/lib/github-release';

export async function GET() {
  const manifest = await getUpdaterManifest();
  if (!manifest) {
    return NextResponse.json(
      {
        error: 'No release available',
        message: 'No published cue release was found.',
      },
      { status: 404 },
    );
  }
  return NextResponse.json(manifest, {
    headers: {
      // Defensive cache header — vercel.ts also sets these but we want them
      // even when running locally / on a non-Vercel host.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
