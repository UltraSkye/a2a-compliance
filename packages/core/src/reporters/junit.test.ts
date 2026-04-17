import { describe, expect, it } from 'vitest';
import type { ComplianceReport } from '../report.js';
import { toJUnitXml } from './junit.js';

const baseReport: ComplianceReport = {
  target: 'https://example.com',
  specVersion: '1.0',
  startedAt: '2026-04-17T00:00:00.000Z',
  finishedAt: '2026-04-17T00:00:01.000Z',
  checks: [
    { id: 'card.reachable', title: 'reachable', severity: 'must', status: 'pass', durationMs: 120 },
    {
      id: 'rpc.parseError',
      title: 'rejects bad JSON',
      severity: 'must',
      status: 'fail',
      message: 'got 200 OK',
      durationMs: 45,
    },
    {
      id: 'card.contentType',
      title: 'content-type',
      severity: 'should',
      status: 'warn',
      durationMs: 1,
    },
  ],
  summary: { total: 3, pass: 1, fail: 1, warn: 1, skip: 0 },
};

describe('toJUnitXml', () => {
  it('emits a valid-looking JUnit XML with proper counts', () => {
    const xml = toJUnitXml(baseReport);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('skipped="0"');
    expect(xml).toContain('classname="card.reachable"');
    expect(xml).toContain('<failure message="got 200 OK"');
    expect(xml).toContain('<warning message=""');
  });

  it('emits <skipped/> for skip-status checks', () => {
    const report: ComplianceReport = {
      ...baseReport,
      checks: [
        {
          id: 'sec.card.fetch',
          title: 'skipped because card unreachable',
          severity: 'info',
          status: 'skip',
          durationMs: 0,
        },
      ],
      summary: { total: 1, pass: 0, fail: 0, warn: 0, skip: 1 },
    };
    const xml = toJUnitXml(report);
    expect(xml).toContain('<skipped/>');
    expect(xml).toContain('skipped="1"');
  });

  it('escapes XML special characters in attributes', () => {
    const report: ComplianceReport = {
      ...baseReport,
      checks: [
        {
          id: 'x',
          title: 'has "quotes" & <tags>',
          severity: 'must',
          status: 'fail',
          message: 'err & <stuff>',
          durationMs: 0,
        },
      ],
      summary: { total: 1, pass: 0, fail: 1, warn: 0, skip: 0 },
    };
    const xml = toJUnitXml(report);
    expect(xml).toContain('&quot;quotes&quot;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;stuff&gt;');
  });

  it('strips disallowed control chars and normalises whitespace', () => {
    const report: ComplianceReport = {
      ...baseReport,
      checks: [
        {
          id: 'c\u0001trl',
          title: 'with\u0000null\u0001and\ttab',
          severity: 'must',
          status: 'fail',
          message: 'line1\r\nline2 <injected>" type="custom',
          durationMs: 0,
        },
      ],
      summary: { total: 1, pass: 0, fail: 1, warn: 0, skip: 0 },
    };
    const xml = toJUnitXml(report);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional assertion.
    expect(xml).not.toMatch(/[\u0000\u0001]/);
    expect(xml).toContain('&lt;injected&gt;&quot;');
    expect(xml).not.toContain('line1\r');
    expect(xml).not.toContain('line1\n');
    expect(xml).toMatch(/line1\s+line2/);
  });
});
