import { AGENT_CARD_WELL_KNOWN_PATH, AgentCardSchema } from '@a2a-compliance/schemas';
import {
  agentCardChecks,
  cardSsrfChecks,
  jsonRpcChecks,
  methodChecks,
  pushNotificationChecks,
} from './assertions/index.js';
import { fetchWithTimeout } from './http.js';
import type { CheckResult, ComplianceReport } from './report.js';
import { summarize } from './report.js';
import type { SpecVersion } from './spec.js';
import { KNOWN_SPEC_VERSIONS, methodsFor, resolveSpecVersion } from './spec.js';

export interface RunOptions {
  specVersion?: string;
  skipProtocol?: boolean;
  skipSecurity?: boolean;
}

export async function runCardChecks(
  baseUrl: string,
  opts: RunOptions = {},
): Promise<ComplianceReport> {
  const startedAt = new Date().toISOString();
  const checks = await agentCardChecks(baseUrl);
  const finishedAt = new Date().toISOString();

  return {
    target: baseUrl,
    specVersion: opts.specVersion ?? '1.0',
    startedAt,
    finishedAt,
    checks,
    summary: summarize(checks),
  };
}

/**
 * Full compliance run: agent-card + protocol conformance + security.
 * Adapts the JSON-RPC method names to whatever protocolVersion the card
 * declares — the same tool tests both v0.3 and v1.0 agents.
 */
export async function runFullChecks(
  baseUrl: string,
  opts: RunOptions = {},
): Promise<ComplianceReport> {
  const startedAt = new Date().toISOString();

  const cardResults = await agentCardChecks(baseUrl);
  // Discovery is decoupled from the protocol probe switch: we still need
  // to know the declared protocolVersion for the card.protocolVersion
  // check, even when the caller passed --skip-protocol.
  const discovery = await discover(baseUrl);

  const version: SpecVersion = resolveSpecVersion(discovery?.protocolVersion);
  const methods = methodsFor(version);

  // Only emit the version check when we actually got a card to read.
  const versionCheck = discovery ? makeVersionCheck(discovery.protocolVersion, version) : undefined;

  const protocolResults =
    !opts.skipProtocol && discovery
      ? [
          ...(await jsonRpcChecks(discovery.endpoint, methods)),
          ...(await methodChecks(discovery.endpoint, methods)),
          ...(await pushNotificationChecks(baseUrl, discovery.endpoint, methods)),
        ]
      : [];
  const securityResults = opts.skipSecurity ? [] : await cardSsrfChecks(baseUrl);

  const checks = [
    ...cardResults,
    ...(versionCheck ? [versionCheck] : []),
    ...protocolResults,
    ...securityResults,
  ];
  const finishedAt = new Date().toISOString();

  return {
    target: baseUrl,
    specVersion: opts.specVersion ?? version,
    startedAt,
    finishedAt,
    checks,
    summary: summarize(checks),
  };
}

interface Discovery {
  endpoint: string;
  protocolVersion: string | undefined;
}

async function discover(baseUrl: string): Promise<Discovery | undefined> {
  const cardUrl = new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString();
  try {
    const res = await fetchWithTimeout(cardUrl);
    if (!res.ok) return undefined;
    const parsed = AgentCardSchema.safeParse(await res.json());
    if (!parsed.success) return undefined;
    return {
      endpoint: parsed.data.url,
      protocolVersion: parsed.data.protocolVersion,
    };
  } catch {
    return undefined;
  }
}

function makeVersionCheck(
  declared: string | undefined,
  resolved: SpecVersion,
): CheckResult | undefined {
  if (declared === undefined) {
    return {
      id: 'card.protocolVersion',
      title: 'Agent card declares a protocolVersion',
      severity: 'should',
      status: 'warn',
      message: `missing — defaulting probes to v${resolved}. Declare it to silence this warning.`,
      durationMs: 0,
    };
  }
  if (!KNOWN_SPEC_VERSIONS.includes(resolved) || declared !== resolved) {
    // declared is set but we don't know it — resolveSpecVersion fell back.
    return {
      id: 'card.protocolVersion',
      title: 'protocolVersion is a version a2a-compliance understands',
      severity: 'should',
      status: 'warn',
      message: `declared "${declared}", known [${KNOWN_SPEC_VERSIONS.join(', ')}] — probing with v${resolved} method names`,
      durationMs: 0,
    };
  }
  return {
    id: 'card.protocolVersion',
    title: `Agent card declares a known protocolVersion (v${declared})`,
    severity: 'should',
    status: 'pass',
    durationMs: 0,
  };
}
