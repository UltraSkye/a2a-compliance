import { redactInText, runFullChecks, ssrfCheckForUrl } from '@a2a-compliance/core';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Compliance reports can include agent metadata; they should never be
// cached by intermediaries. 'force-dynamic' covers Next's own cache,
// this covers CDNs / browsers / corporate proxies.
function noCacheJson(body: unknown, init?: ResponseInit): Response {
  const res = NextResponse.json(body, init);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

const MAX_URL_LENGTH = 2048;
// Cap the request body at 8 KB — the payload is one JSON object with a
// single string field; real bodies are a few hundred bytes. This stops a
// 10-GB POST from being buffered into memory by req.json().
const MAX_REQUEST_BYTES = 8 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  // Early reject on oversized declared body. req.json() consumes the full
  // stream — we don't want that for adversarial inputs.
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return noCacheJson(
      { error: `request body too large (>${MAX_REQUEST_BYTES} bytes)` },
      { status: 413 },
    );
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return noCacheJson({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.url !== 'string' || body.url.length === 0) {
    return noCacheJson({ error: 'missing "url" in request body' }, { status: 400 });
  }
  if (body.url.length > MAX_URL_LENGTH) {
    return noCacheJson({ error: 'url too long' }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return noCacheJson({ error: 'not a valid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return noCacheJson({ error: 'only http(s) URLs are accepted' }, { status: 400 });
  }

  // SSRF guard on the hostname the caller asked us to probe: if their URL
  // already points at private IP space, we refuse — otherwise the hosted
  // dashboard becomes an open SSRF probe against its own network.
  const safety = await ssrfCheckForUrl(body.url);
  if (!safety.ok) {
    return noCacheJson(
      { error: `refusing to probe this URL: ${safety.reason ?? 'private-space target'}` },
      { status: 400 },
    );
  }

  try {
    const report = await runFullChecks(body.url);
    return noCacheJson(report);
  } catch (err) {
    // Redact URLs from error messages before surfacing them to the caller;
    // internal fetch failures sometimes embed the fetched URL verbatim.
    const message = redactInText(err instanceof Error ? err.message : String(err));
    return noCacheJson({ error: message }, { status: 500 });
  }
}
