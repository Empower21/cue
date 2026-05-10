import { NextResponse } from 'next/server';
import type { ReleaseManifestPlatform } from '@cue/shared';
import { getInstallerUrl } from '@/lib/github-release';

const VALID_PLATFORMS: ReadonlySet<ReleaseManifestPlatform> = new Set([
  'darwin-aarch64',
  'darwin-x86_64',
  'windows-x86_64',
]);

function isValidPlatform(value: string): value is ReleaseManifestPlatform {
  return VALID_PLATFORMS.has(value as ReleaseManifestPlatform);
}

interface RouteContext {
  params: Promise<{ platform: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { platform } = await context.params;

  if (!isValidPlatform(platform)) {
    return NextResponse.json(
      { error: 'Unknown platform', valid: Array.from(VALID_PLATFORMS) },
      { status: 400 },
    );
  }

  const url = await getInstallerUrl(platform);
  if (!url) {
    return NextResponse.json(
      {
        error: 'No release available yet',
        message:
          'The first cue release has not been published. Check back soon, or watch the GitHub repo for the v0.1.0 tag.',
      },
      { status: 404 },
    );
  }

  return NextResponse.redirect(url, { status: 302 });
}
