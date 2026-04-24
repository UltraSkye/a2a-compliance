import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

const TITLE = 'a2a-compliance — dashboard';
const DESCRIPTION =
  'Interactive compliance testing for Agent2Agent (A2A) protocol endpoints. ' +
  'Probe an agent URL, get an instant pass/fail report for card schema, ' +
  'JSON-RPC conformance, and SSRF/TLS/CORS hygiene.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Share cards on Twitter/Slack/LinkedIn/etc.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en">
      <body {...(nonce ? { 'data-nonce': nonce } : {})}>{children}</body>
    </html>
  );
}
