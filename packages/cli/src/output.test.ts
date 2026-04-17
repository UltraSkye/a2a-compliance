import { describe, expect, it } from 'vitest';
import { sanitizeForTerminal } from './output.js';

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
