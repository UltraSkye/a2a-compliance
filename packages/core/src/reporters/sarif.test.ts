import { describe, expect, it } from 'vitest';
import type { ComplianceReport } from '../report.js';
import { summarize } from '../report.js';
import { toSarif } from './sarif.js';

function makeReport(checks: ComplianceReport['checks']): ComplianceReport {
  return {
    target: 'https://agent.example.com',
    specVersion: '1.0',
    startedAt: '2026-04-18T00:00:00.000Z',
    finishedAt: '2026-04-18T00:00:01.000Z',
    checks,
    summary: summarize(checks),
  };
}

describe('toSarif', () => {
  it('produces valid SARIF 2.1.0 JSON with rules drawn from the catalog', () => {
    const report = makeReport([
      {
        id: 'card.reachable',
        title: 'Agent card reachable',
        severity: 'must',
        status: 'pass',
        category: 'card',
        durationMs: 1,
      },
    ]);
    const parsed = JSON.parse(toSarif(report));
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs[0].tool.driver.name).toBe('a2a-compliance');
    const rules = parsed.runs[0].tool.driver.rules;
    const reachableRule = rules.find((r: { id: string }) => r.id === 'card.reachable');
    expect(reachableRule).toBeDefined();
    expect(reachableRule.properties.category).toBe('card');
    // passes don't become result rows — SARIF consumers only want findings.
    expect(parsed.runs[0].results).toEqual([]);
    expect(parsed.runs[0].properties.tier).toBe('FULL_FEATURED');
  });

  it('maps must-fail to error level', () => {
    const report = makeReport([
      {
        id: 'rpc.parseError',
        title: 'Rejects invalid JSON',
        severity: 'must',
        status: 'fail',
        category: 'protocol',
        message: 'got 200',
        durationMs: 3,
      },
    ]);
    const parsed = JSON.parse(toSarif(report));
    const result = parsed.runs[0].results[0];
    expect(result.ruleId).toBe('rpc.parseError');
    expect(result.level).toBe('error');
    expect(result.properties.severity).toBe('must');
    expect(result.properties.status).toBe('fail');
    expect(result.message.text).toContain('got 200');
  });

  it('maps should-fail / warn to warning level', () => {
    const report = makeReport([
      {
        id: 'card.contentType',
        title: 'content-type',
        severity: 'should',
        status: 'warn',
        category: 'card',
        durationMs: 0,
      },
    ]);
    const parsed = JSON.parse(toSarif(report));
    expect(parsed.runs[0].results[0].level).toBe('warning');
  });

  it('assigns note level to info-severity failures', () => {
    const report = makeReport([
      {
        id: 'custom',
        title: 'custom skipped',
        severity: 'info',
        status: 'fail',
        category: 'protocol',
        durationMs: 0,
      },
    ]);
    const parsed = JSON.parse(toSarif(report));
    expect(parsed.runs[0].results[0].level).toBe('note');
  });

  it('defaults uncategorised checks to protocol in location logicalLocations', () => {
    const report = makeReport([
      {
        id: 'uncategorised.id',
        title: 'no catalog',
        severity: 'must',
        status: 'fail',
        durationMs: 0,
      },
    ]);
    const parsed = JSON.parse(toSarif(report));
    const loc = parsed.runs[0].results[0].locations[0].logicalLocations[0];
    expect(loc.fullyQualifiedName).toBe('protocol.uncategorised.id');
  });

  it('surfaces tier in run properties', () => {
    const report = makeReport([
      {
        id: 'card.reachable',
        title: 'reachable',
        severity: 'must',
        status: 'fail',
        category: 'card',
        durationMs: 0,
      },
    ]);
    const parsed = JSON.parse(toSarif(report));
    expect(parsed.runs[0].properties.tier).toBe('NON_COMPLIANT');
  });
});
