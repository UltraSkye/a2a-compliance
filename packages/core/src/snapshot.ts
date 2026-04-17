import type { CheckStatus, ComplianceReport } from './report.js';

export const SNAPSHOT_VERSION = 1 as const;

export interface Snapshot {
  version: typeof SNAPSHOT_VERSION;
  target: string;
  specVersion: string;
  capturedAt: string;
  checks: Record<string, CheckStatus>;
}

export interface SnapshotDiffEntry {
  id: string;
  was: CheckStatus;
  now: CheckStatus;
}

export interface SnapshotDiff {
  regressions: SnapshotDiffEntry[];
  improvements: SnapshotDiffEntry[];
  added: Array<{ id: string; now: CheckStatus }>;
  removed: Array<{ id: string; was: CheckStatus }>;
}

export function toSnapshot(report: ComplianceReport): Snapshot {
  const checks: Record<string, CheckStatus> = {};
  for (const c of report.checks) {
    checks[c.id] = c.status;
  }
  return {
    version: SNAPSHOT_VERSION,
    target: report.target,
    specVersion: report.specVersion,
    capturedAt: report.finishedAt,
    checks,
  };
}

// Severity order used to classify regression vs improvement.
// Higher = worse. 'skip' sits next to 'pass' — losing a previously-passing
// check by skipping it is not a regression.
const WEIGHT: Record<CheckStatus, number> = {
  pass: 0,
  skip: 0,
  warn: 1,
  fail: 2,
};

export function diffSnapshot(base: Snapshot, report: ComplianceReport): SnapshotDiff {
  const diff: SnapshotDiff = {
    regressions: [],
    improvements: [],
    added: [],
    removed: [],
  };

  const current: Record<string, CheckStatus> = {};
  for (const c of report.checks) {
    current[c.id] = c.status;
  }

  for (const [id, now] of Object.entries(current)) {
    const was = base.checks[id];
    if (was === undefined) {
      diff.added.push({ id, now });
      continue;
    }
    if (WEIGHT[now] > WEIGHT[was]) {
      diff.regressions.push({ id, was, now });
    } else if (WEIGHT[now] < WEIGHT[was]) {
      diff.improvements.push({ id, was, now });
    }
  }

  for (const [id, was] of Object.entries(base.checks)) {
    if (!(id in current)) diff.removed.push({ id, was });
  }

  return diff;
}

export function hasRegressions(diff: SnapshotDiff): boolean {
  return diff.regressions.length > 0;
}
