import type { ComplianceReport } from '@a2a-compliance/core';
import { describe, expect, it } from 'vitest';
import { toProblemMatcherLines } from './run.js';

function report(partial: Partial<ComplianceReport['checks'][number]>): ComplianceReport {
  const base: ComplianceReport['checks'][number] = {
    id: 'rpc.messageSend.shape',
    title: 'send returns a valid JSON-RPC response',
    severity: 'must',
    status: 'fail',
    durationMs: 0,
    ...partial,
  };
  return {
    target: 'https://agent.example.com',
    specVersion: '1.0',
    startedAt: '2025-01-01T00:00:00Z',
    finishedAt: '2025-01-01T00:00:01Z',
    checks: [base],
    summary: { total: 1, pass: 0, fail: 1, warn: 0, skip: 0, tier: 'NON_COMPLIANT' },
  };
}

describe('toProblemMatcherLines', () => {
  it('emits one line with the expected field layout', () => {
    const lines = toProblemMatcherLines(report({ message: 'agent down' }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      '::a2a::error::rpc.messageSend.shape::https://agent.example.com:1:1::agent down',
    );
  });

  it('skips pass and skip rows', () => {
    const r: ComplianceReport = report({ status: 'pass' });
    const first = r.checks[0];
    if (!first) throw new Error('fixture produced no checks');
    r.checks.push({ ...first, id: 'other', status: 'skip' });
    expect(toProblemMatcherLines(r)).toEqual([]);
  });

  it('neutralises `::` inside agent-supplied messages to prevent field spoofing', () => {
    const hostile = 'x::error::fake.id::/etc/passwd:1:1::spoofed annotation';
    const lines = toProblemMatcherLines(report({ message: hostile }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('::fake.id::');
    expect(lines[0]).not.toContain('::/etc/passwd:');
    expect(lines[0]?.startsWith('::a2a::error::rpc.messageSend.shape::')).toBe(true);
    expect(lines[0]).toContain('x: :error: :fake.id: :/etc/passwd:1:1: :spoofed annotation');
  });

  it('collapses CR/LF in messages so multi-line payloads stay on one line', () => {
    const lines = toProblemMatcherLines(report({ message: 'line1\r\nline2\nline3' }));
    expect(lines[0]).toContain('line1 line2 line3');
    expect(lines[0]).not.toMatch(/[\r\n]/);
  });

  it('falls back to title when no message is set', () => {
    const lines = toProblemMatcherLines(report({}));
    expect(lines[0]).toContain('send returns a valid JSON-RPC response');
  });

  it('maps severity + status to the right annotation level', () => {
    const mustFail = toProblemMatcherLines(report({ severity: 'must', status: 'fail' }));
    expect(mustFail[0]?.split('::')[2]).toBe('error');

    const shouldFail = toProblemMatcherLines(report({ severity: 'should', status: 'fail' }));
    expect(shouldFail[0]?.split('::')[2]).toBe('warning');

    const warn = toProblemMatcherLines(report({ severity: 'must', status: 'warn' }));
    expect(warn[0]?.split('::')[2]).toBe('warning');
  });
});
