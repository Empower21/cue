import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Allow workspace packages to be transpiled
  transpilePackages: ['@cue/shared'],
};

export default config;
