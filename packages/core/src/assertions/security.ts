import { AGENT_CARD_WELL_KNOWN_PATH, AgentCardSchema } from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, type ProbeOptions, readCappedJson } from '../http.js';
import { ssrfCheckForUrl } from '../private-network.js';
import { redactInText } from '../redact.js';
import type { CheckResult } from '../report.js';

// Re-export the helpers at their original locations so public consumers
// can keep importing from '@a2a-compliance/core' without breakage.
export {
  isPrivateIPv4,
  isPrivateIPv6,
  normalizeV6ToV4,
  ssrfCheckForUrl,
} from '../private-network.js';

function collectCardUrls(card: unknown): string[] {
  const parsed = AgentCardSchema.safeParse(card);
  if (!parsed.success) return [];
  const c = parsed.data;
  const urls: string[] = [c.url];
  if (c.provider?.url) urls.push(c.provider.url);
  if (c.documentationUrl) urls.push(c.documentationUrl);
  return urls;
}

export async function cardSsrfChecks(
  baseUrl: string,
  probe: ProbeOptions = {},
): Promise<CheckResult[]> {
  const t0 = now();
  const cardUrl = new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString();

  // Single fetch — we also want the response headers for the CORS check.
  let res: Response;
  let card: unknown;
  try {
    res = await fetchWithTimeout(
      cardUrl,
      probe.pinDns === undefined ? {} : { pinDns: probe.pinDns },
    );
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
        message: redactInText(err instanceof Error ? err.message : String(err)),
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
