import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { AGENT_CARD_WELL_KNOWN_PATH, AgentCardSchema } from '@a2a-compliance/schemas';
import { fetchWithTimeout, now } from '../http.js';
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

function isPrivateIPv4(ip: string): boolean {
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

function isPrivateIPv6(ip: string): boolean {
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

async function ssrfCheckForUrl(rawUrl: string): Promise<{ ok: boolean; reason?: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `not a valid URL: ${rawUrl}` };
  }

  // Literal IPs in the URL — check directly.
  if (isIP(url.hostname)) {
    if (isIP(url.hostname) === 4 && isPrivateIPv4(url.hostname)) {
      return { ok: false, reason: `literal IP ${url.hostname} is in a private range` };
    }
    if (isIP(url.hostname) === 6 && isPrivateIPv6(url.hostname)) {
      return { ok: false, reason: `literal IPv6 ${url.hostname} is in a private range` };
    }
    return { ok: true };
  }

  // Special hostnames.
  const lowerHost = url.hostname.toLowerCase();
  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
    return { ok: false, reason: `hostname resolves to localhost` };
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
  const results: CheckResult[] = [];
  const t0 = now();
  const cardUrl = new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString();

  let card: unknown;
  try {
    const res = await fetchWithTimeout(cardUrl);
    if (!res.ok) {
      results.push({
        id: 'sec.card.fetch',
        title: 'Agent card fetched for security checks',
        severity: 'info',
        status: 'skip',
        message: `card not reachable (HTTP ${res.status})`,
        durationMs: now() - t0,
      });
      return results;
    }
    card = await res.json();
  } catch (err) {
    results.push({
      id: 'sec.card.fetch',
      title: 'Agent card fetched for security checks',
      severity: 'info',
      status: 'skip',
      message: err instanceof Error ? err.message : String(err),
      durationMs: now() - t0,
    });
    return results;
  }

  const urls = collectCardUrls(card);
  if (urls.length === 0) {
    results.push({
      id: 'sec.card.fetch',
      title: 'Agent card parsed for security checks',
      severity: 'info',
      status: 'skip',
      message: 'card did not parse, nothing to probe',
      durationMs: now() - t0,
    });
    return results;
  }

  // 1. HTTPS-only — http:// card URLs are a red flag for secrets in transit.
  for (const rawUrl of urls) {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'https:') {
        results.push({
          id: 'sec.tls.https',
          title: `Card URL uses HTTPS: ${redact(rawUrl)}`,
          severity: 'must',
          status: 'fail',
          message: `uses ${u.protocol} — A2A credentials would travel in cleartext`,
          durationMs: 0,
        });
      }
    } catch {
      // URL already flagged by schema validator; ignore here.
    }
  }

  // 2. SSRF — each URL must not resolve into private space.
  for (const rawUrl of urls) {
    const ts = now();
    const ssrf = await ssrfCheckForUrl(rawUrl);
    results.push({
      id: 'sec.ssrf',
      title: `Card URL does not resolve to private IP space: ${redact(rawUrl)}`,
      severity: 'must',
      status: ssrf.ok ? 'pass' : 'fail',
      ...(ssrf.ok ? {} : { message: ssrf.reason ?? 'private-space resolution' }),
      durationMs: now() - ts,
    });
  }

  // 3. Basic response hygiene on the card itself.
  try {
    const res = await fetchWithTimeout(cardUrl);
    // Agent card SHOULD NOT set Access-Control-Allow-Origin: * without
    // Access-Control-Allow-Credentials=false — otherwise any origin can read
    // the card and attack from there.
    const aco = res.headers.get('access-control-allow-origin');
    const acc = res.headers.get('access-control-allow-credentials');
    if (aco === '*' && acc?.toLowerCase() === 'true') {
      results.push({
        id: 'sec.cors.wildcardWithCreds',
        title: 'Agent card does not allow wildcard origins with credentials',
        severity: 'must',
        status: 'fail',
        message: 'ACAO:* combined with ACAC:true is a browser-CORS violation',
        durationMs: 0,
      });
    } else {
      results.push({
        id: 'sec.cors.wildcardWithCreds',
        title: 'Agent card does not allow wildcard origins with credentials',
        severity: 'must',
        status: 'pass',
        durationMs: 0,
      });
    }
  } catch {
    // Already covered by the reachability check earlier.
  }

  return results;
}

function redact(s: string): string {
  // Keep URLs readable but don't leak query-string credentials in reports.
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return s;
  }
}
