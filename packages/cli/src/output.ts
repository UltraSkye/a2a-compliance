import type { CheckResult, ComplianceTier } from '@a2a-compliance/core';
import pc from 'picocolors';

export type FailOn = 'any' | 'must' | 'never';

/**
 * Strip ANSI escape sequences and disallowed control characters from a
 * string before we feed it to `console.log`. Probe responses include
 * agent-controlled strings (error.message, Content-Type values, skill
 * names) — without this an attacker-supplied card can clear the
 * operator's terminal, relocate the cursor, or inject fake "pass" rows
 * by emitting ANSI cursor-move + fake glyphs.
 */
export function sanitizeForTerminal(s: string): string {
  return (
    s
      // ESC [ ... CSI sequences (colours, cursor moves, clear)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal-escape sequences ARE the target.
      .replace(/\u001b\[[0-9;?]*[@-~]/g, '')
      // ESC ] ... (OSC) sequences terminated by BEL or ST
      // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal-escape sequences ARE the target.
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
      // Single-char ESC sequences (C1 controls)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal-escape sequences ARE the target.
      .replace(/\u001b[@-Z\\-_]/g, '')
      // CR/LF are collapsed to spaces so multi-line payloads don't reformat
      // adjacent rows; remaining C0 controls except HT (\t) are stripped.
      .replace(/[\r\n]+/g, ' ')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional C0/DEL stripping.
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
  );
}

export function printHuman(target: string, checks: CheckResult[], tier?: ComplianceTier): void {
  console.log(pc.bold(`\nA2A compliance — ${sanitizeForTerminal(target)}\n`));
  for (const c of checks) {
    const icon = statusIcon(c.status);
    const sev = pc.dim(`[${c.severity.toUpperCase()}]`);
    console.log(`  ${icon} ${sev} ${sanitizeForTerminal(c.title)}`);
    if (c.message) {
      console.log(`    ${pc.dim(sanitizeForTerminal(c.message))}`);
    }
  }

  const pass = checks.filter((c) => c.status === 'pass').length;
  const fail = checks.filter((c) => c.status === 'fail').length;
  const warn = checks.filter((c) => c.status === 'warn').length;
  const tail = tier ? `  ${pc.bold('tier:')} ${tierColor(tier)}` : '';
  console.log(
    `\n  ${pc.green(`${pass} passed`)}, ${pc.yellow(`${warn} warnings`)}, ${pc.red(`${fail} failed`)}${tail}\n`,
  );
}

function tierColor(tier: ComplianceTier): string {
  switch (tier) {
    case 'FULL_FEATURED':
      return pc.green(tier);
    case 'RECOMMENDED':
      return pc.green(tier);
    case 'MANDATORY':
      return pc.yellow(tier);
    case 'NON_COMPLIANT':
      return pc.red(tier);
  }
}

export function decideExit(checks: CheckResult[], mode: FailOn): number {
  if (mode === 'never') return 0;
  const failed = checks.filter((c) => c.status === 'fail');
  if (mode === 'any' && failed.length > 0) return 1;
  if (mode === 'must' && failed.some((c) => c.severity === 'must')) return 1;
  return 0;
}

function statusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'pass':
      return pc.green('✓');
    case 'fail':
      return pc.red('✗');
    case 'warn':
      return pc.yellow('!');
    case 'skip':
      return pc.dim('-');
  }
}
