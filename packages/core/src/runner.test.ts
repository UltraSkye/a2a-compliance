import { describe, expect, it } from 'vitest';
import { summarize } from './report.js';

describe('summarize', () => {
  it('counts check results by status', () => {
    const out = summarize([
      { id: 'a', title: 'a', severity: 'must', status: 'pass', durationMs: 0 },
      { id: 'b', title: 'b', severity: 'must', status: 'fail', durationMs: 0 },
      { id: 'c', title: 'c', severity: 'should', status: 'warn', durationMs: 0 },
      { id: 'd', title: 'd', severity: 'info', status: 'skip', durationMs: 0 },
      { id: 'e', title: 'e', severity: 'must', status: 'pass', durationMs: 0 },
    ]);
    expect(out).toEqual({ total: 5, pass: 2, fail: 1, warn: 1, skip: 1 });
  });
});
