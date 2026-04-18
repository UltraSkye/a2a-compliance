import { describe, expect, it } from 'vitest';
import type { ComplianceReport } from './report.js';
import { summarize } from './report.js';
import { diffSnapshot, hasRegressions, parseSnapshot, toSnapshot } from './snapshot.js';

function makeReport(checks: Array<[string, 'pass' | 'fail' | 'warn' | 'skip']>): ComplianceReport {
  const fullChecks = checks.map(([id, status]) => ({
    id,
    title: id,
    severity: 'must' as const,
    status,
    durationMs: 0,
  }));
  return {
    target: 'https://x',
    specVersion: '1.0',
    startedAt: '2026-04-17T00:00:00.000Z',
    finishedAt: '2026-04-17T00:00:01.000Z',
    checks: fullChecks,
    summary: summarize(fullChecks),
  };
}

describe('toSnapshot', () => {
  it('strips durations and messages', () => {
    const snap = toSnapshot(
      makeReport([
        ['a', 'pass'],
        ['b', 'fail'],
      ]),
    );
    expect(snap.checks).toEqual({ a: 'pass', b: 'fail' });
    expect(snap.version).toBe(1);
  });
});

describe('diffSnapshot', () => {
  it('detects regression pass → fail', () => {
    const base = toSnapshot(makeReport([['a', 'pass']]));
    const now = makeReport([['a', 'fail']]);
    const diff = diffSnapshot(base, now);
    expect(diff.regressions).toEqual([{ id: 'a', was: 'pass', now: 'fail' }]);
    expect(hasRegressions(diff)).toBe(true);
  });

  it('detects regression warn → fail', () => {
    const base = toSnapshot(makeReport([['a', 'warn']]));
    const now = makeReport([['a', 'fail']]);
    expect(diffSnapshot(base, now).regressions).toHaveLength(1);
  });

  it('detects improvement fail → pass', () => {
    const base = toSnapshot(makeReport([['a', 'fail']]));
    const now = makeReport([['a', 'pass']]);
    const diff = diffSnapshot(base, now);
    expect(diff.improvements).toEqual([{ id: 'a', was: 'fail', now: 'pass' }]);
    expect(diff.regressions).toHaveLength(0);
  });

  it('treats pass → skip as neither regression nor improvement', () => {
    const base = toSnapshot(makeReport([['a', 'pass']]));
    const now = makeReport([['a', 'skip']]);
    const diff = diffSnapshot(base, now);
    expect(diff.regressions).toHaveLength(0);
    expect(diff.improvements).toHaveLength(0);
  });

  it('rejects malformed snapshot files via parseSnapshot', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot({ version: 2, target: 'x', checks: {} })).toBeNull();
    expect(
      parseSnapshot({
        version: 1,
        target: 'x',
        specVersion: '1',
        capturedAt: 'x',
        checks: { id: 'bogus' },
      }),
    ).toBeNull();
    expect(
      parseSnapshot({
        version: 1,
        target: 'x',
        specVersion: '1',
        capturedAt: 'x',
        checks: { id: 'pass' },
      }),
    ).not.toBeNull();
  });

  it('tracks added and removed checks', () => {
    const base = toSnapshot(
      makeReport([
        ['a', 'pass'],
        ['b', 'pass'],
      ]),
    );
    const now = makeReport([
      ['a', 'pass'],
      ['c', 'warn'],
    ]);
    const diff = diffSnapshot(base, now);
    expect(diff.added).toEqual([{ id: 'c', now: 'warn' }]);
    expect(diff.removed).toEqual([{ id: 'b', was: 'pass' }]);
  });
});
