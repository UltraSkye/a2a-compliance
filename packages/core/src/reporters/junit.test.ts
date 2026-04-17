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
});
