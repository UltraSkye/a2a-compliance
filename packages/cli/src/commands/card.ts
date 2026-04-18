import { runCardChecks } from '@a2a-compliance/core';
import type { Command } from 'commander';
import { Option } from 'commander';
import type { FailOn } from '../output.js';
import { decideExit, printHuman } from '../output.js';

interface CardOptions {
  json?: boolean;
  failOn?: FailOn;
}

export function registerCardCommand(program: Command): void {
  program
    .command('card <url>')
    .description('Validate an A2A agent card at /.well-known/agent-card.json')
    .option('--json', 'output report as JSON (for CI)')
    .addOption(
      new Option('--fail-on <mode>', 'exit non-zero on given severity')
        .choices(['any', 'must', 'never'])
        .default('must'),
    )
    .action(async (url: string, opts: CardOptions) => {
      const report = await runCardChecks(url);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printHuman(report.target, report.checks, report.summary.tier);
      }

      process.exit(decideExit(report.checks, opts.failOn ?? 'must'));
    });
}
