import { describe, expect, it } from 'vitest';
import { decorate, decorateAll } from './decorate.js';
import type { CheckResult } from './report.js';

function chk(id: string, overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id,
    title: id,
    severity: 'must',
    status: 'pass',
    durationMs: 0,
    ...overrides,
  };
}

describe('decorate', () => {
  it('fills category and specRef from catalog when absent', () => {
    const out = decorate(chk('card.reachable'));
    expect(out.category).toBe('card');
    expect(out.specRef?.url).toContain('a2a-protocol.org');
  });

  it('preserves explicit category on the result over catalog value', () => {
    const out = decorate(chk('card.reachable', { category: 'spec' }));
    expect(out.category).toBe('spec');
  });

  it('preserves explicit specRef over catalog value', () => {
    const custom = { section: 'custom', url: 'https://example.com/custom' };
    const out = decorate(chk('card.reachable', { specRef: custom }));
    expect(out.specRef).toEqual(custom);
  });

  it('leaves unknown ids untouched', () => {
    const c = chk('unknown.id');
    const out = decorate(c);
    expect(out.category).toBeUndefined();
    expect(out.specRef).toBeUndefined();
  });

  it('decorateAll maps every check', () => {
    const out = decorateAll([chk('card.reachable'), chk('sec.ssrf'), chk('nope')]);
    expect(out[0]?.category).toBe('card');
    expect(out[1]?.category).toBe('security');
    expect(out[2]?.category).toBeUndefined();
  });
});
