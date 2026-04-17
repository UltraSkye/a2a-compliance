import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // a2a-compliance/core is a monorepo workspace — transpile on demand.
  transpilePackages: ['@a2a-compliance/core', '@a2a-compliance/schemas'],
};

export default config;
