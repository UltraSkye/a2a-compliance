import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { AGENT_CARD_WELL_KNOWN_PATH, AgentCardSchema } from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, readCappedJson } from '../http.js';
import type { CheckResult } from '../report.js';

// A2A agents publish URLs that your client will POST credentials and messages
// to. Attacker-controlled Agent Cards can therefore redirect a client into
// scanning or attacking internal infrastructure — classic SSRF. These checks
// flag card URLs that resolve to loopback, link-local, carrier-NAT, or
// RFC 1918 private ranges, plus a couple of transport hygiene signals.

/**
 * Collect all URLs referenced by the agent card that a naive client might
 * connect to. Missing fields are simply skipped.
 */
function collectCardUrls(card: unknown): string[] {
  const parsed = AgentCardSchema.safeParse(card);
  if (!parsed.success) return [];
  const c = parsed.data;
  const urls: string[] = [c.url];
  if (c.provider?.url) urls.push(c.provider.url);
  if (c.documentationUrl) urls.push(c.documentationUrl);
  return urls;
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGN
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

/**
 * Expand an IPv6 address string into its 16-byte representation, or
 * undefined if the input isn't a syntactically valid IPv6. Supports the
 * double-colon abbreviation and an embedded dotted IPv4 tail.
 */
function ipv6ToBytes(ip: string): number[] | undefined {
  const addr = ip.toLowerCase().split('%')[0] ?? ''; // strip zone identifier
  const halves = addr.split('::');
  if (halves.length > 2) return undefined;

  let head = (halves[0] ?? '').length > 0 ? (halves[0] ?? '').split(':') : [];
  let tail =
    halves.length === 2 && (halves[1] ?? '').length > 0 ? (halves[1] ?? '').split(':') : [];

  // Dotted-IPv4 tail ("::ffff:127.0.0.1") — split it into two hex groups.
  const last = tail.length > 0 ? tail[tail.length - 1] : head[head.length - 1];
  if (last && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(last)) {
    const octets = last.split('.').map(Number);
    if (octets.some((n) => n > 255)) return undefined;
    const hi = (((octets[0] ?? 0) << 8) | (octets[1] ?? 0)).toString(16);
    const lo = (((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16);
    if (tail.length > 0) {
      tail = [...tail.slice(0, -1), hi, lo];
    } else {
      head = [...head.slice(0, -1), hi, lo];
    }
  }

  const groups =
    halves.length === 2
      ? (() => {
          const missing = 8 - head.length - tail.length;
          if (missing < 0) return undefined;
          return [...head, ...Array<string>(missing).fill('0'), ...tail];
        })()
      : head;
  if (!groups || groups.length !== 8) return undefined;

  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return undefined;
    const n = Number.parseInt(g, 16);
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

/**
 * If the address embeds an IPv4 in a form that routes back to v4 — IPv4-mapped
 * (::ffff:a.b.c.d), deprecated IPv4-compat (::a.b.c.d), or the well-known NAT64
 * prefix (64:ff9b::a.b.c.d per RFC 6052) — return that v4 as dotted-decimal.
 * Accepts canonical, hex-group, and fully-expanded representations alike.
 *
 * Without this step an attacker DNS record resolving to e.g.
 * `::ffff:127.0.0.1` or its hex twin `::ffff:7f00:1` reaches the IPv6-prefix
 * classifier, which doesn't recognise it as loopback and lets the SSRF probe
 * through.
 */
export function normalizeV6ToV4(ip: string): string {
  const bytes = ipv6ToBytes(ip);
  if (!bytes) return ip;

  const mapped =
    bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const compat = bytes.slice(0, 12).every((b) => b === 0);
  const nat64 =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((b) => b === 0);

  if (mapped || compat || nat64) {
    return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
  }
  return ip;
}

export function isPrivateIPv6(ip: string): boolean {
  // First: unwrap IPv4-mapped / compat / NAT64 and defer to v4 classifier.
  const maybeV4 = normalizeV6ToV4(ip);
  if (isIP(maybeV4) === 4) return isPrivateIPv4(maybeV4);

  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower === '::') return true;
  return false;
}

async function resolveAll(hostname: string): Promise<string[]> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: false });
    return records.map((r) => r.address);
  } catch {
    return [];
  }
}

/** Detailed SSRF inspection of a single URL. Exported for use in the web API guard. */
export async function ssrfCheckForUrl(rawUrl: string): Promise<{ ok: boolean; reason?: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `not a valid URL: ${rawUrl}` };
  }

  // Node's URL keeps brackets around literal IPv6 hostnames; isIP needs them
  // stripped to recognise the address.
  const host =
    url.hostname.startsWith('[') && url.hostname.endsWith(']')
      ? url.hostname.slice(1, -1)
      : url.hostname;

  if (isIP(host)) {
    const v = isIP(host);
    if (v === 4 && isPrivateIPv4(host)) {
      return { ok: false, reason: `literal IP ${host} is in a private range` };
    }
    if (v === 6 && isPrivateIPv6(host)) {
      return { ok: false, reason: `literal IPv6 ${host} is in a private range` };
    }
    return { ok: true };
  }

  const lowerHost = url.hostname.toLowerCase();
  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
    return { ok: false, reason: 'hostname resolves to localhost' };
  }

  const ips = await resolveAll(url.hostname);
  if (ips.length === 0) {
    return { ok: false, reason: `hostname did not resolve: ${url.hostname}` };
  }
  for (const ip of ips) {
    if (isIP(ip) === 4 && isPrivateIPv4(ip)) {
      return { ok: false, reason: `${url.hostname} resolves to private IPv4 ${ip}` };
    }
    if (isIP(ip) === 6 && isPrivateIPv6(ip)) {
      return { ok: false, reason: `${url.hostname} resolves to private IPv6 ${ip}` };
    }
  }
  return { ok: true };
}

export async function cardSsrfChecks(baseUrl: string): Promise<CheckResult[]> {
  const t0 = now();
  const cardUrl = new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString();

  // Single fetch — we also want the response headers for the CORS check.
  let res: Response;
  let card: unknown;
  try {
    res = await fetchWithTimeout(cardUrl);
    if (!res.ok) {
      return [
        {
          id: 'sec.card.fetch',
          title: 'Agent card fetched for security checks',
          severity: 'info',
          status: 'skip',
          message: `card not reachable (HTTP ${res.status})`,
          durationMs: now() - t0,
        },
      ];
    }
    card = await readCappedJson(res);
  } catch (err) {
    return [
      {
        id: 'sec.card.fetch',
        title: 'Agent card fetched for security checks',
        severity: 'info',
        status: 'skip',
        message: err instanceof Error ? err.message : String(err),
        durationMs: now() - t0,
      },
    ];
  }

  const urls = collectCardUrls(card);
  if (urls.length === 0) {
    return [
      {
        id: 'sec.card.fetch',
        title: 'Agent card parsed for security checks',
        severity: 'info',
        status: 'skip',
        message: 'card did not parse, nothing to probe',
        durationMs: now() - t0,
      },
    ];
  }

  const results: CheckResult[] = [];

  // 1. HTTPS-only — aggregate across all card URLs.
  const cleartextUrls = urls.filter((u) => {
    try {
      return new URL(u).protocol !== 'https:';
    } catch {
      return false;
    }
  });
  results.push({
    id: 'sec.tls.https',
    title: 'All URLs declared in the agent card use HTTPS',
    severity: 'must',
    status: cleartextUrls.length === 0 ? 'pass' : 'fail',
    ...(cleartextUrls.length > 0
      ? { message: `cleartext URLs: ${cleartextUrls.map(redact).join(', ')}` }
      : {}),
    durationMs: 0,
  });

  // 2. SSRF — aggregate across all card URLs.
  const ssrfStart = now();
  const ssrfFailures: string[] = [];
  for (const rawUrl of urls) {
    const r = await ssrfCheckForUrl(rawUrl);
    if (!r.ok) ssrfFailures.push(r.reason ? `${redact(rawUrl)}: ${r.reason}` : redact(rawUrl));
  }
  results.push({
    id: 'sec.ssrf',
    title: 'No agent-card URL resolves to private IP space',
    severity: 'must',
    status: ssrfFailures.length === 0 ? 'pass' : 'fail',
    ...(ssrfFailures.length > 0 ? { message: ssrfFailures.join('; ') } : {}),
    durationMs: now() - ssrfStart,
  });

  // 3. CORS hygiene — reuse the headers from the initial fetch.
  const aco = res.headers.get('access-control-allow-origin');
  const acc = res.headers.get('access-control-allow-credentials');
  const corsFail = aco === '*' && acc?.toLowerCase() === 'true';
  results.push({
    id: 'sec.cors.wildcardWithCreds',
    title: 'Agent card does not allow wildcard origins with credentials',
    severity: 'must',
    status: corsFail ? 'fail' : 'pass',
    ...(corsFail ? { message: 'ACAO:* combined with ACAC:true is a browser-CORS violation' } : {}),
    durationMs: 0,
  });

  return results;
}

function redact(s: string): string {
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return s;
  }
}
