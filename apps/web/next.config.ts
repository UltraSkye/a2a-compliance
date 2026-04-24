import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Root of the pnpm workspace — Next.js uses it to trace workspace imports
// into the standalone bundle so the Docker image doesn't need node_modules.
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

// CSP is set per-request by middleware.ts so we can use a nonce; everything
// else is a static header.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // 2-year HSTS + preload-eligible. Set on every response so a downgrade
  // MITM can't coax the browser back to http on a subsequent visit.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Harden the origin for modern browsers: deny cross-origin window access,
  // force same-origin credentialed embeds, and require CORP opt-in.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  transpilePackages: ['@a2a-compliance/core', '@a2a-compliance/schemas'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default config;
