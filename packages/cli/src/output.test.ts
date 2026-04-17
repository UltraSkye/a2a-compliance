import type { CheckResult } from '@a2a-compliance/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideExit, printHuman, sanitizeForTerminal } from './output.js';

function chk(
  status: CheckResult['status'],
  severity: CheckResult['severity'] = 'must',
): CheckResult {
  return { id: status, title: status, severity, status, durationMs: 0 };
}

describe('sanitizeForTerminal', () => {
  it('strips CSI colour sequences', () => {
    expect(sanitizeForTerminal('\u001b[31mred\u001b[0m')).toBe('red');
  });

  it('strips cursor-move sequences used to fake check rows', () => {
    // "\x1b[2J\x1b[H" clears screen + homes cursor — would let an agent
    // overwrite the operator's "fail" rows with fake "pass" text.
    expect(sanitizeForTerminal('\u001b[2J\u001b[Hsneaky')).toBe('sneaky');
  });

  it('strips OSC sequences (window title hijack)', () => {
    expect(sanitizeForTerminal('\u001b]0;Totally Safe\u0007alert')).toBe('alert');
  });

  it('normalises CR and LF to single spaces', () => {
    expect(sanitizeForTerminal('line1\r\nline2')).toBe('line1 line2');
  });

  it('strips raw C0 control bytes', () => {
    expect(sanitizeForTerminal('a\u0000b\u0001c\u001ad')).toBe('abcd');
  });

  it('leaves plain text alone', () => {
    expect(sanitizeForTerminal('nothing to escape here.')).toBe('nothing to escape here.');
  });

  it('preserves tab within a line', () => {
    expect(sanitizeForTerminal('col1\tcol2')).toBe('col1\tcol2');
  });
});

describe('printHuman', () => {
  afterEach(() => vi.restoreAllMocks());

  function captureLog(): () => string[] {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.join(' '));
    });
    return () => lines;
  }

  it('renders each check with its status icon, severity and title', () => {
    const lines = captureLog();
    printHuman('https://agent.example.com', [
      chk('pass'),
      chk('fail', 'should'),
      chk('warn', 'info'),
      chk('skip', 'info'),
    ]);
    const out = lines().join('\n');
    expect(out).toContain('https://agent.example.com');
    expect(out).toMatch(/\[MUST\]/);
    expect(out).toMatch(/\[SHOULD\]/);
    expect(out).toMatch(/\[INFO\]/);
    expect(out).toMatch(/1 passed/);
    expect(out).toMatch(/1 failed/);
    expect(out).toMatch(/1 warnings/);
  });

  it('prints the check message on its own indented line when present', () => {
    const lines = captureLog();
    printHuman('x', [{ ...chk('fail'), message: 'agent down' }]);
    const out = lines().join('\n');
    expect(out).toMatch(/agent down/);
  });

  it('sanitises ANSI / control chars in target and title before printing', () => {
    const lines = captureLog();
    printHuman('https://evil\u001b[2J.com', [
      { ...chk('pass'), title: '\u001b[31mhacked\u001b[0m' },
    ]);
    const out = lines().join('\n');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: testing ANSI strip.
    expect(out).not.toMatch(/\u001b\[2J/);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: testing ANSI strip.
    expect(out).not.toMatch(/\u001b\[31m/);
  });
});

describe('decideExit', () => {
  it('returns 0 when every check passed, regardless of mode', () => {
    const checks = [chk('pass'), chk('pass', 'should')];
    expect(decideExit(checks, 'must')).toBe(0);
    expect(decideExit(checks, 'any')).toBe(0);
    expect(decideExit(checks, 'never')).toBe(0);
  });

  it("'must' mode — exits 1 only on MUST-level failure", () => {
    expect(decideExit([chk('fail', 'must')], 'must')).toBe(1);
    expect(decideExit([chk('fail', 'should')], 'must')).toBe(0);
    expect(decideExit([chk('warn', 'must')], 'must')).toBe(0);
    expect(decideExit([chk('skip', 'must')], 'must')).toBe(0);
  });

  it("'any' mode — exits 1 on any failure, regardless of severity", () => {
    expect(decideExit([chk('fail', 'must')], 'any')).toBe(1);
    expect(decideExit([chk('fail', 'should')], 'any')).toBe(1);
    expect(decideExit([chk('fail', 'info')], 'any')).toBe(1);
    expect(decideExit([chk('warn', 'must')], 'any')).toBe(0); // warn is not fail
  });

  it("'never' mode — always exits 0", () => {
    expect(decideExit([chk('fail', 'must'), chk('fail', 'should')], 'never')).toBe(0);
  });

  it('treats empty report as pass', () => {
    expect(decideExit([], 'must')).toBe(0);
    expect(decideExit([], 'any')).toBe(0);
  });
});
