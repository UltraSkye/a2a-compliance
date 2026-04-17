import { AGENT_CARD_WELL_KNOWN_PATH, AgentCardSchema } from '@a2a-compliance/schemas';
import { agentCardChecks, jsonRpcChecks, methodChecks } from './assertions/index.js';
import { fetchWithTimeout } from './http.js';
import type { ComplianceReport } from './report.js';
import { summarize } from './report.js';

export interface RunOptions {
  /** A2A protocol version label recorded in the report (e.g. '1.0'). */
  specVersion?: string;
  /** Skip live JSON-RPC probing. Default: false. */
  skipProtocol?: boolean;
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
 * Full compliance run: agent-card + protocol conformance.
 * The JSON-RPC endpoint is discovered from `card.url`.
 */
export async function runFullChecks(
  baseUrl: string,
  opts: RunOptions = {},
): Promise<ComplianceReport> {
  const startedAt = new Date().toISOString();

  const cardResults = await agentCardChecks(baseUrl);
  const rpcEndpoint = opts.skipProtocol ? undefined : await discoverEndpoint(baseUrl);

  const protocolResults = rpcEndpoint
    ? [...(await jsonRpcChecks(rpcEndpoint)), ...(await methodChecks(rpcEndpoint))]
    : [];
  const checks = [...cardResults, ...protocolResults];
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

async function discoverEndpoint(baseUrl: string): Promise<string | undefined> {
  const cardUrl = new URL(AGENT_CARD_WELL_KNOWN_PATH, baseUrl).toString();
  try {
    const res = await fetchWithTimeout(cardUrl);
    if (!res.ok) return undefined;
    const parsed = AgentCardSchema.safeParse(await res.json());
    if (!parsed.success) return undefined;
    return parsed.data.url;
  } catch {
    return undefined;
  }
}
