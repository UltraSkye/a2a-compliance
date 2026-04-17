import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Root of the pnpm workspace — Next.js uses it to trace workspace imports
// into the standalone bundle so the Docker image doesn't need node_modules.
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@a2a-compliance/core', '@a2a-compliance/schemas'],
};

export default config;
