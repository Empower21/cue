import type { VercelConfig } from '@vercel/config/v1';

// Vercel project root is `apps/web/` (where this file lives). Vercel's pnpm-
// workspace auto-detection walks up to find `pnpm-workspace.yaml` at the repo
// root and installs the full workspace, so `@cue/shared` is wired up at build.
// We only override what the Next.js framework preset doesn't already handle:
// redirects + cache headers.
export const config: VercelConfig = {
  framework: 'nextjs',
  redirects: [
    { source: '/install', destination: '/download', permanent: false },
    { source: '/license', destination: '/eula', permanent: false },
  ],
  headers: [
    {
      source: '/(_next/static|favicon.svg)/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/api/manifest',
      headers: [{ key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=3600' }],
    },
    {
      source: '/api/download/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=3600' }],
    },
  ],
};

export default config;
