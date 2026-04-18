import { describe, expect, it } from 'vitest';
import type { ComplianceReport } from '../report.js';
import { summarize } from '../report.js';
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
    summary: summarize(checks),
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

  describe('tier mode', () => {
    it('renders FULL_FEATURED with green', () => {
      const svg = toBadgeSvg(makeReport([{ status: 'pass' }]), { tier: true });
      expect(svg).toContain('full-featured');
      expect(svg).toContain('#4c1');
    });

    it('renders RECOMMENDED with light-green when something was skipped', () => {
      const svg = toBadgeSvg(
        makeReport([{ status: 'pass' }, { status: 'skip', severity: 'should' }]),
        { tier: true },
      );
      expect(svg).toContain('recommended');
      expect(svg).toContain('#97ca00');
    });

    it('renders MANDATORY with yellow when a should failed', () => {
      const svg = toBadgeSvg(
        makeReport([{ status: 'pass' }, { status: 'fail', severity: 'should' }]),
        { tier: true },
      );
      expect(svg).toContain('mandatory');
      expect(svg).toContain('#dfb317');
    });

    it('renders NON_COMPLIANT with red when a must failed', () => {
      const svg = toBadgeSvg(makeReport([{ status: 'fail', severity: 'must' }]), { tier: true });
      expect(svg).toContain('non-compliant');
      expect(svg).toContain('#e05d44');
    });
  });
});
