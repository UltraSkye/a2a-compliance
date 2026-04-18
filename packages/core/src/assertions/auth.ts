import type { AgentCard } from '@a2a-compliance/schemas';
import {
  AGENT_CARD_WELL_KNOWN_PATH,
  AgentCardSchema,
  isErrorResponse,
  JsonRpcResponseSchema,
} from '@a2a-compliance/schemas';
import { fetchWithTimeout, now, readCappedJson, readCappedText } from '../http.js';
import { redactInText } from '../redact.js';
import type { CheckResult } from '../report.js';
import type { SpecMethods } from '../spec.js';

/**
 * Probe authentication behaviour: if the card declares any non-'none'
 * security scheme, a fully unauthenticated `message/send` probe should
 * be challenged rather than allowed or silently 500-ing.
 *
 * This never carries credentials — the tool deliberately doesn't accept
 * any today, because the moment we take an operator's token on the
 * command line it has to be redacted everywhere, refreshed, etc. The
 * probe confirms the endpoint *rejects* anonymous access in a spec-
 * consistent way: HTTP 401+WWW-Authenticate, or a typed JSON-RPC error
 * from the A2A error-code space (-32001..-32010 are already tolerated).
 */
export async function authProbeChecks(
  baseUrl: string,
  methods: SpecMethods,
): Promise<CheckResult[]> {
  const card = await fetchCard(baseUrl);
  if (!card) return [];

  const schemes = card.authentication?.schemes ?? [];
  // Cards without any authentication declaration are treated as public
  // by clients — running the anon-challenge probe against them would
  // produce false positives, so skip entirely.
  const hasGatedScheme = schemes.some((s) => s !== 'none');
  if (!hasGatedScheme) return [];

  const endpoint = card.url;
  const results: CheckResult[] = [];
  results.push(await anonChallengeCheck(endpoint, methods));

  if (schemes.includes('oauth2') || schemes.includes('openIdConnect')) {
    results.push(await oauthDiscoveryCheck(baseUrl, card));
  }

  return results;
}

async function anonChallengeCheck(endpoint: string, methods: SpecMethods): Promise<CheckResult> {
  const t0 = now();
  const id = 'auth.anonChallenge';
  const title = `${methods.send} challenges unauthenticated callers`;
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: methods.send,
        params: { message: { role: 'user', parts: [{ type: 'text', text: 'anon probe' }] } },
      }),
    });

    // HTTP-layer challenge: 401 with WWW-Authenticate is the textbook answer.
    if (res.status === 401) {
      const www = res.headers.get('www-authenticate');
      return {
        id,
        title,
        severity: 'should',
        status: www ? 'pass' : 'warn',
        message: www
          ? `HTTP 401 with WWW-Authenticate: ${www}`
          : 'HTTP 401 without WWW-Authenticate header — spec-compliant but less ergonomic',
        durationMs: now() - t0,
      };
    }

    // 403 is acceptable too — means the server identified the request as
    // an anon call and refused it. Less ergonomic than 401 but not wrong.
    if (res.status === 403) {
      return {
        id,
        title,
        severity: 'should',
        status: 'pass',
        message: 'HTTP 403 — anonymous callers are refused',
        durationMs: now() - t0,
      };
    }

    // HTTP 2xx/5xx path: if a server returns 200 with a typed JSON-RPC
    // error from the A2A auth code space, that's also fine. A 5xx stack
    // trace or a 200 with a task/message is NOT — it means the server
    // doesn't enforce the auth scheme it declared.
    const text = await readCappedText(res);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        id,
        title,
        severity: 'should',
        status: 'fail',
        message: `HTTP ${res.status} body is not JSON; expected 401+WWW-Authenticate`,
        durationMs: now() - t0,
      };
    }
    const parsed = JsonRpcResponseSchema.safeParse(json);
    if (parsed.success && isErrorResponse(parsed.data)) {
      const code = parsed.data.error.code;
      // -32001..-32010 are the A2A domain errors (TaskNotFound through
      // auth-related). -32000 and unknown codes also acceptable — the
      // point is typed error, not "happy 200".
      const agentMsg = redactInText(parsed.data.error.message);
      const reasonable = code <= -32000 && code >= -32099;
      return {
        id,
        title,
        severity: 'should',
        status: reasonable ? 'pass' : 'warn',
        message: `typed JSON-RPC error ${code}: ${agentMsg}`,
        durationMs: now() - t0,
      };
    }

    return {
      id,
      title,
      severity: 'should',
      status: 'fail',
      message: `HTTP ${res.status} with no auth challenge — declared auth schemes ${''} are unenforced`,
      durationMs: now() - t0,
    };
  } catch (err) {
    return {
      id,
      title,
      severity: 'should',
      status: 'fail',
      message: redactInText(err instanceof Error ? err.message : String(err)),
      durationMs: now() - t0,
    };
  }
}

async function oauthDiscoveryCheck(baseUrl: string, card: AgentCard): Promise<CheckResult> {
  const t0 = now();
  const id = 'auth.discovery';
  const title = 'OAuth / OIDC discovery endpoints are reachable';

  // Prefer an OIDC well-known under the agent's origin; fall back to
  // card.provider?.url. Either location being reachable counts as
  // "discoverable".
  const origin = new URL(baseUrl).origin;
  const candidates: string[] = [
    new URL('/.well-known/openid-configuration', origin).toString(),
    new URL('/.well-known/oauth-authorization-server', origin).toString(),
  ];
  if (card.provider?.url) {
    try {
      const provOrigin = new URL(card.provider.url).origin;
      candidates.push(new URL('/.well-known/openid-configuration', provOrigin).toString());
    } catch {
      // ignore
    }
  }

  const tried: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' });
      tried.push(`${url} → ${res.status}`);
      if (res.status >= 200 && res.status < 400) {
        return {
          id,
          title,
          severity: 'should',
          status: 'pass',
          message: `${url} → ${res.status}`,
          durationMs: now() - t0,
        };
      }
    } catch (err) {
      tried.push(`${url} → err: ${redactInText(err instanceof Error ? err.message : String(err))}`);
    }
  }

  return {
    id,
    title,
    severity: 'should',
    status: 'warn',
    message: `no OIDC/OAuth discovery endpoint reachable; tried: ${tried.join('; ')}`,
    durationMs: now() - t0,
  };
}

async function fetchCard(baseUrl: string): Promise<AgentCard | undefined> {
  try {
    const res = await fetchWithTimeout(new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString());
    if (!res.ok) return undefined;
    const parsed = AgentCardSchema.safeParse(await readCappedJson(res));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
