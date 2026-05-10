import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Allow workspace packages to be transpiled
  transpilePackages: ['@cue/shared'],
  // Pin the file-tracing root to the monorepo, so Next doesn't accidentally
  // climb to an unrelated lockfile in a parent OneDrive folder.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
};

export default config;
