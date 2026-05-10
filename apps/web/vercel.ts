import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'pnpm --filter @cue/web build',
  outputDirectory: 'apps/web/.next',
  installCommand: 'pnpm install --frozen-lockfile',
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
