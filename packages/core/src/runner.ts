import { agentCardChecks } from './assertions/index.js';
import type { ComplianceReport } from './report.js';
import { summarize } from './report.js';

export interface RunOptions {
  /** A2A protocol version label recorded in the report (e.g. '1.0'). */
  specVersion?: string;
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
