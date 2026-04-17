import { writeFileSync } from 'node:fs';
import { runFullChecks, toBadgeSvg, toJUnitXml } from '@a2a-compliance/core';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { FailOn } from '../output.js';
import { decideExit, printHuman } from '../output.js';

interface RunOptions {
  json?: boolean;
  junit?: string;
  badge?: string;
  failOn?: FailOn;
  skipProtocol?: boolean;
  skipSecurity?: boolean;
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <url>')
    .description(
      'Run full compliance: agent card + JSON-RPC protocol conformance against the endpoint',
    )
    .option('--json', 'output report as JSON (to stdout)')
    .option('--junit <path>', 'also write a JUnit XML report to <path>')
    .option('--badge <path>', 'also write a Shields-style SVG badge to <path>')
    .option('--fail-on <mode>', 'exit non-zero on: any | must (default) | never', 'must')
    .option('--skip-protocol', 'skip live JSON-RPC checks (card-only run)')
    .option('--skip-security', 'skip SSRF/TLS/CORS security checks')
    .action(async (url: string, opts: RunOptions) => {
      const report = await runFullChecks(url, {
        skipProtocol: opts.skipProtocol === true,
        skipSecurity: opts.skipSecurity === true,
      });

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHuman(report.target, report.checks);
      }

      if (opts.junit) {
        writeFileSync(opts.junit, toJUnitXml(report), 'utf8');
        if (!opts.json) console.log(pc.dim(`  JUnit report written to ${opts.junit}`));
      }

      if (opts.badge) {
        writeFileSync(opts.badge, toBadgeSvg(report), 'utf8');
        if (!opts.json) console.log(pc.dim(`  Badge SVG written to ${opts.badge}`));
      }

      process.exit(decideExit(report.checks, opts.failOn ?? 'must'));
    });
}
