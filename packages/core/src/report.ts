export type Severity = 'must' | 'should' | 'info';
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
export type Category = 'card' | 'protocol' | 'methods' | 'security' | 'spec' | 'auth';
export type ComplianceTier = 'NON_COMPLIANT' | 'MANDATORY' | 'RECOMMENDED' | 'FULL_FEATURED';

export interface SpecRef {
  section: string;
  url: string;
}

export interface CheckResult {
  id: string;
  title: string;
  severity: Severity;
  status: CheckStatus;
  category?: Category;
  specRef?: SpecRef;
  message?: string;
  evidence?: unknown;
  durationMs: number;
}

export interface ComplianceSummary {
  total: number;
  pass: number;
  fail: number;
  warn: number;
  skip: number;
  tier: ComplianceTier;
}

export interface ComplianceReport {
  target: string;
  specVersion: string;
  startedAt: string;
  finishedAt: string;
  checks: CheckResult[];
  summary: ComplianceSummary;
}

export function summarize(checks: CheckResult[]): ComplianceSummary {
  const summary: ComplianceSummary = {
    total: checks.length,
    pass: 0,
    fail: 0,
    warn: 0,
    skip: 0,
    tier: tierFor(checks),
  };
  for (const c of checks) {
    summary[c.status] += 1;
  }
  return summary;
}

/**
 * Derive the human-readable compliance tier from the check results.
 *
 * - NON_COMPLIANT — any MUST-level check failed.
 * - MANDATORY — all MUSTs pass, but some SHOULDs failed or warned.
 * - RECOMMENDED — all MUSTs and SHOULDs pass, but some capabilities
 *   weren't covered (e.g. capability-gated checks skipped).
 * - FULL_FEATURED — every emitted check passes.
 *
 * Info-severity skip markers (sec.card.fetch, push-notification
 * capability marker) don't count against the tier — they exist so
 * reports make clear a probe block was intentionally skipped.
 */
export function tierFor(checks: CheckResult[]): ComplianceTier {
  const mustFailed = checks.some((c) => c.severity === 'must' && c.status === 'fail');
  if (mustFailed) return 'NON_COMPLIANT';
  const shouldNotPass = checks.some(
    (c) => c.severity === 'should' && (c.status === 'fail' || c.status === 'warn'),
  );
  if (shouldNotPass) return 'MANDATORY';
  const hasSkip = checks.some((c) => c.status === 'skip' && c.severity !== 'info');
  if (hasSkip) return 'RECOMMENDED';
  return 'FULL_FEATURED';
}
