import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ssrfCheckForUrl } from './private-network.js';

export const DEFAULT_TIMEOUT_MS = 10_000;

// Cap every agent-card / JSON-RPC response at 2 MB. Agent cards are metadata
// documents — real-world ones are 1–20 kB. Anything dramatically larger is
// either a misconfigured endpoint or an adversary trying to OOM our process.
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

// How many redirects to follow before giving up. Matches fetch defaults;
// attackers don't usually need more than 2-3 hops to land on interesting
// private targets, so this is a generous ceiling.
export const DEFAULT_MAX_REDIRECTS = 10;

// User-Agent we identify as when probing. Letting an operator see
// 'a2a-compliance/<ver>' in their access log is politer than blank /
// node-fetch and tells them exactly which release is hitting their
// endpoint. Version is read from this package's own package.json so
// the UA stays in sync with whatever tag was actually published.
function readPackageVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
export const USER_AGENT = `a2a-compliance/${readPackageVersion()}`;

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Max redirect hops to follow. Default: 10. */
  maxRedirects?: number;
}

/**
 * Drop-in replacement for fetch with two safety properties the stock
 * `fetch(url, { redirect: 'follow' })` does not give you:
 *
 *   1. AbortController-backed timeout (10 s default).
 *   2. SSRF re-check on every redirect hop. A public target that returns a
 *      30x Location pointing at 169.254.169.254 (AWS metadata) would
 *      silently land us on the private address otherwise — ingress
 *      SSRF guards on the initial URL only cover the first hop.
 *
 * The initial URL is *not* SSRF-checked here; the caller is expected to
 * have done that already (the web API does it explicitly, the CLI probes
 * operator-supplied targets by design). Only redirects are filtered.
 */
export async function fetchWithTimeout(url: string, opts: FetchOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      const headers = new Headers(opts.headers);
      if (!headers.has('user-agent')) headers.set('user-agent', USER_AGENT);
      const init: RequestInit = {
        method: opts.method ?? 'GET',
        signal: ctrl.signal,
        redirect: 'manual',
        headers,
      };
      if (opts.body !== undefined) init.body = opts.body;
      res = await fetch(currentUrl, init);
    } finally {
      clearTimeout(t);
    }

    // 3xx with a Location header — resolve it and re-check SSRF before
    // following. Anything else (including 3xx without Location) we hand
    // back to the caller as-is.
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      const location = res.headers.get('location') ?? '';
      const target = new URL(location, currentUrl).toString();
      const safety = await ssrfCheckForUrl(target);
      if (!safety.ok) {
        throw new Error(
          `refused to follow redirect to ${target}: ${safety.reason ?? 'private-space target'}`,
        );
      }
      currentUrl = target;
      continue;
    }

    return res;
  }

  throw new Error(`too many redirects (>${maxRedirects}) starting at ${url}`);
}

export class ResponseTooLargeError extends Error {
  constructor(
    public readonly bytesRead: number,
    public readonly cap: number,
  ) {
    super(`response body exceeded ${cap} bytes (read ${bytesRead})`);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Read a Response body as text, aborting if it exceeds `maxBytes`.
 * Consults Content-Length first for an early bail, then streams with a
 * running byte count. Callers should catch ResponseTooLargeError.
 */
export async function readCappedText(
  res: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ResponseTooLargeError(declared, maxBytes);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return res.text();
  }

  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore.
      }
      throw new ResponseTooLargeError(bytesRead, maxBytes);
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

/** Read a response as JSON with the same size cap. Throws on parse error. */
export async function readCappedJson(
  res: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const text = await readCappedText(res, maxBytes);
  return JSON.parse(text);
}

export function now(): number {
  return performance.now();
}
