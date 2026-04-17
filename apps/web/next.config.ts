import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Root of the pnpm workspace — Next.js uses it to trace workspace imports
// into the standalone bundle so the Docker image doesn't need node_modules.
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

// Defence-in-depth headers. None of them are load-bearing — the tool has no
// cookies and no client-side secret handling — but shipping them removes
// obvious footguns if the dashboard ever gets embedded in an environment
// that relies on them (iframe, corp SSO, etc.) and silences any
// downstream 'missing security headers' scan reports.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }, // not intended to be iframed
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // A2A dashboard never renders third-party scripts. Strict CSP keeps any
  // future XSS regression tightly bounded.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Next.js inlines hydration data
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
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
