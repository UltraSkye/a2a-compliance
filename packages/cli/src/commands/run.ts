import { writeFileSync } from 'node:fs';
import type { CheckResult } from '@a2a-compliance/core';
import { runFullChecks, toJUnitXml } from '@a2a-compliance/core';
import type { Command } from 'commander';
import pc from 'picocolors';

interface RunOptions {
  json?: boolean;
  junit?: string;
  failOn?: 'any' | 'must' | 'never';
  skipProtocol?: boolean;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <url>')
    .description(
      'Run full compliance: agent card + JSON-RPC protocol conformance against the endpoint',
    )
    .option('--json', 'output report as JSON (to stdout)')
    .option('--junit <path>', 'also write a JUnit XML report to <path>')
    .option('--fail-on <mode>', 'exit non-zero on: any | must (default) | never', 'must')
    .option('--skip-protocol', 'skip live JSON-RPC checks (card-only run)')
    .action(async (url: string, opts: RunOptions) => {
      const report = await runFullChecks(url, { skipProtocol: opts.skipProtocol === true });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHuman(report.target, report.checks);
      }

      if (opts.junit) {
        writeFileSync(opts.junit, toJUnitXml(report), 'utf8');
        if (!opts.json) {
          console.log(pc.dim(`  JUnit report written to ${opts.junit}`));
        }
      }

      process.exit(decideExit(report.checks, opts.failOn ?? 'must'));
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
