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

export function isPrivateIPv6(ip: string): boolean {
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

  if (isIP(url.hostname)) {
    const v = isIP(url.hostname);
    if (v === 4 && isPrivateIPv4(url.hostname)) {
      return { ok: false, reason: `literal IP ${url.hostname} is in a private range` };
    }
    if (v === 6 && isPrivateIPv6(url.hostname)) {
      return { ok: false, reason: `literal IPv6 ${url.hostname} is in a private range` };
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
