import { describe, expect, it } from 'vitest';
import type { ComplianceReport } from '../report.js';
import { toBadgeSvg } from './badge.js';

function makeReport(
  overrides: Partial<ComplianceReport['checks'][number]>[] = [],
): ComplianceReport {
  const checks = overrides.map((o, i) => ({
    id: o.id ?? `chk-${i}`,
    title: o.title ?? 'x',
    severity: o.severity ?? ('must' as const),
    status: o.status ?? ('pass' as const),
    durationMs: 0,
    ...o,
  }));
  return {
    target: 'https://x',
    specVersion: '1.0',
    startedAt: '2026-04-17T00:00:00.000Z',
    finishedAt: '2026-04-17T00:00:00.000Z',
    checks,
    summary: {
      total: checks.length,
      pass: checks.filter((c) => c.status === 'pass').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      skip: checks.filter((c) => c.status === 'skip').length,
    },
  };
}

describe('toBadgeSvg', () => {
  it('renders a green badge when all MUST checks pass', () => {
    const svg = toBadgeSvg(makeReport([{ status: 'pass', severity: 'must' }]));
    expect(svg).toContain('#4c1'); // green
    expect(svg).toContain('v1.0');
  });

  it('renders a yellow badge on warnings without MUST failures', () => {
    const svg = toBadgeSvg(
      makeReport([
        { status: 'pass', severity: 'must' },
        { status: 'warn', severity: 'should' },
      ]),
    );
    expect(svg).toContain('#dfb317'); // yellow
    expect(svg).toContain('warn');
  });

  it('renders a red badge on any MUST failure', () => {
    const svg = toBadgeSvg(
      makeReport([
        { status: 'fail', severity: 'must', message: 'nope' },
        { status: 'pass', severity: 'must' },
      ]),
    );
    expect(svg).toContain('#e05d44'); // red
    expect(svg).toContain('failing');
  });

  it('escapes XML specials and is valid-looking XML', () => {
    const svg = toBadgeSvg(makeReport([{ status: 'pass' }]), { label: 'a & b' });
    expect(svg).toContain('a &amp; b');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('</svg>');
  });
});
