export type Severity = 'must' | 'should' | 'info';
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CheckResult {
  id: string;
  title: string;
  severity: Severity;
  status: CheckStatus;
  message?: string;
  evidence?: unknown;
  durationMs: number;
}

export interface ComplianceReport {
  target: string;
  specVersion: string;
  startedAt: string;
  finishedAt: string;
  checks: CheckResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    warn: number;
    skip: number;
  };
}

export function summarize(checks: CheckResult[]): ComplianceReport['summary'] {
  const summary = { total: checks.length, pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const c of checks) {
    summary[c.status] += 1;
  }
  return summary;
}
