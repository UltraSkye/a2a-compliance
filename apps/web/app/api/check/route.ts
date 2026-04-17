import { runFullChecks, ssrfCheckForUrl } from '@a2a-compliance/core';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_URL_LENGTH = 2048;

export async function POST(req: NextRequest): Promise<Response> {
  // Parse + basic shape checks.
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.url !== 'string' || body.url.length === 0) {
    return NextResponse.json({ error: 'missing "url" in request body' }, { status: 400 });
  }
  if (body.url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ error: 'url too long' }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return NextResponse.json({ error: 'not a valid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'only http(s) URLs are accepted' }, { status: 400 });
  }

  // SSRF guard on the hostname the caller asked us to probe: if their URL
  // already points at private IP space, we refuse — otherwise the hosted
  // dashboard becomes an open SSRF probe against its own network.
  const safety = await ssrfCheckForUrl(body.url);
  if (!safety.ok) {
    return NextResponse.json(
      { error: `refusing to probe this URL: ${safety.reason ?? 'private-space target'}` },
      { status: 400 },
    );
  }

  try {
    const report = await runFullChecks(body.url);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
