import type { CheckResult } from '@a2a-compliance/core';
import { runCardChecks } from '@a2a-compliance/core';
import type { Command } from 'commander';
import pc from 'picocolors';

interface CardOptions {
  json?: boolean;
  failOn?: 'any' | 'must' | 'never';
}

export function registerCardCommand(program: Command): void {
  program
    .command('card <url>')
    .description('Validate an A2A agent card at /.well-known/agent-card.json')
    .option('--json', 'output report as JSON (for CI)')
    .option(
      '--fail-on <mode>',
      'exit with non-zero on: any failure | must-level only | never',
      'must',
    )
    .action(async (url: string, opts: CardOptions) => {
      const report = await runCardChecks(url);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHuman(report.target, report.checks);
      }

      const exitCode = decideExit(report.checks, opts.failOn ?? 'must');
      process.exit(exitCode);
    });
}

function printHuman(target: string, checks: CheckResult[]): void {
  console.log(pc.bold(`\nA2A compliance — ${target}\n`));
  for (const c of checks) {
    const icon = statusIcon(c.status);
    const sev = pc.dim(`[${c.severity.toUpperCase()}]`);
    console.log(`  ${icon} ${sev} ${c.title}`);
    if (c.message) {
      console.log(`    ${pc.dim(c.message)}`);
    }
  }

  const pass = checks.filter((c) => c.status === 'pass').length;
  const fail = checks.filter((c) => c.status === 'fail').length;
  const warn = checks.filter((c) => c.status === 'warn').length;
  console.log(
    `\n  ${pc.green(`${pass} passed`)}, ${pc.yellow(`${warn} warnings`)}, ${pc.red(`${fail} failed`)}\n`,
  );
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

function decideExit(checks: CheckResult[], mode: 'any' | 'must' | 'never'): number {
  if (mode === 'never') return 0;
  const failed = checks.filter((c) => c.status === 'fail');
  if (mode === 'any' && failed.length > 0) return 1;
  if (mode === 'must' && failed.some((c) => c.severity === 'must')) return 1;
  return 0;
}
