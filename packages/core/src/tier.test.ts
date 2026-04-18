import { describe, expect, it } from 'vitest';
import type { CheckResult } from './report.js';
import { tierFor } from './report.js';

function chk(
  status: CheckResult['status'],
  severity: CheckResult['severity'] = 'must',
): CheckResult {
  return { id: status, title: status, severity, status, durationMs: 0 };
}

describe('tierFor', () => {
  it('NON_COMPLIANT on any must-fail', () => {
    expect(tierFor([chk('fail', 'must')])).toBe('NON_COMPLIANT');
    expect(tierFor([chk('pass'), chk('fail', 'must')])).toBe('NON_COMPLIANT');
  });

  it('MANDATORY when musts pass but a should fails or warns', () => {
    expect(tierFor([chk('pass'), chk('fail', 'should')])).toBe('MANDATORY');
    expect(tierFor([chk('pass'), chk('warn', 'should')])).toBe('MANDATORY');
  });

  it('RECOMMENDED when everything passes but some non-info check is skipped', () => {
    expect(tierFor([chk('pass'), chk('skip', 'should')])).toBe('RECOMMENDED');
  });

  it('FULL_FEATURED when every emitted check passes', () => {
    expect(tierFor([chk('pass', 'must'), chk('pass', 'should')])).toBe('FULL_FEATURED');
  });

  it('info-level skips (capability markers) do not drop the tier to RECOMMENDED', () => {
    expect(tierFor([chk('pass', 'must'), chk('skip', 'info')])).toBe('FULL_FEATURED');
  });
});
