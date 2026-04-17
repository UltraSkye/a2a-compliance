import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ComplianceReport, SnapshotDiff } from '@a2a-compliance/core';
import {
  diffSnapshot,
  hasRegressions,
  parseSnapshot,
  runFullChecks,
  toBadgeSvg,
  toJUnitXml,
  toSnapshot,
} from '@a2a-compliance/core';
import type { Command } from 'commander';
import { Option } from 'commander';
import pc from 'picocolors';
import type { FailOn } from '../output.js';
import { decideExit, printHuman } from '../output.js';

interface RunOptions {
  json?: boolean;
  junit?: string;
  badge?: string;
  snapshot?: string;
  snapshotOut?: string;
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
    .option('--snapshot-out <path>', 'write a snapshot of the current compliance state to <path>')
    .option(
      '--snapshot <path>',
      'compare this run against a baseline snapshot; exit non-zero on any regression',
    )
    .addOption(
      new Option('--fail-on <mode>', 'exit non-zero on given severity')
        .choices(['any', 'must', 'never'])
        .default('must'),
    )
    .option('--skip-protocol', 'skip live JSON-RPC checks (card-only run)')
    .option('--skip-security', 'skip SSRF/TLS/CORS security checks')
    .action(async (url: string, opts: RunOptions) => {
      const report = await runFullChecks(url, {
        skipProtocol: opts.skipProtocol === true,
        skipSecurity: opts.skipSecurity === true,
      });

      const diff = opts.snapshot ? compareSnapshot(report, opts.snapshot) : undefined;

      if (opts.json) {
        console.log(JSON.stringify(diff ? { ...report, snapshotDiff: diff } : report, null, 2));
      } else {
        printHuman(report.target, report.checks);
        if (diff) printDiff(diff);
      }

      if (opts.junit) writeArtefact('JUnit report', opts.junit, toJUnitXml(report), opts.json);
      if (opts.badge) writeArtefact('Badge SVG', opts.badge, toBadgeSvg(report), opts.json);
      if (opts.snapshotOut) {
        writeArtefact(
          'Snapshot',
          opts.snapshotOut,
          JSON.stringify(toSnapshot(report), null, 2),
          opts.json,
        );
      }

      const mode = opts.failOn ?? 'must';
      let exitCode = decideExit(report.checks, mode);
      if (mode !== 'never' && diff && hasRegressions(diff)) exitCode = 1;
      process.exit(exitCode);
    });
}

// Snapshots are keyed by check id; real ones are a few hundred bytes. Cap at
// 4 MB so an operator who passes --snapshot to a huge or malicious JSON file
// gets a clear error instead of an OOM.
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

// mkdir -p the parent of `path`, then write `contents`. Translates the
// common ENOENT/EACCES stack traces into one-line errors that point at
// exactly which artefact failed — the alternative is the probe running
// to completion and only then crashing with a raw Node trace.
function writeArtefact(
  label: string,
  path: string,
  contents: string,
  json: boolean | undefined,
): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to write ${label} to ${path}: ${msg}`);
  }
  if (!json) console.log(pc.dim(`  ${label} written to ${path}`));
}

function compareSnapshot(report: ComplianceReport, path: string): SnapshotDiff {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `snapshot file not found: ${path}\n  capture one first with --snapshot-out <path>`,
      );
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(`snapshot file ${path} is not readable: ${code}`);
    }
    throw err;
  }
  if (stats.size > MAX_SNAPSHOT_BYTES) {
    throw new Error(
      `snapshot file ${path} is ${stats.size} bytes, above the ${MAX_SNAPSHOT_BYTES}-byte cap`,
    );
  }
  const raw = readFileSync(path, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`snapshot file ${path} is not valid JSON: ${(err as Error).message}`);
  }
  const base = parseSnapshot(data);
  if (!base) {
    throw new Error(
      `snapshot file ${path} does not match the expected format (version: 1, target, checks, …)`,
    );
  }
  return diffSnapshot(base, report);
}

function printDiff(diff: SnapshotDiff): void {
  const { regressions, improvements, added, removed } = diff;
  if (
    regressions.length === 0 &&
    improvements.length === 0 &&
    added.length === 0 &&
    removed.length === 0
  ) {
    console.log(pc.dim('  Snapshot: no changes since baseline.\n'));
    return;
  }

  console.log(pc.bold('\nSnapshot diff:'));
  for (const r of regressions) {
    console.log(`  ${pc.red('✗ regression')} ${r.id}: ${r.was} → ${r.now}`);
  }
  for (const i of improvements) {
    console.log(`  ${pc.green('✓ improved')}  ${i.id}: ${i.was} → ${i.now}`);
  }
  for (const a of added) {
    console.log(`  ${pc.yellow('+ added')}    ${a.id}: ${a.now}`);
  }
  for (const r of removed) {
    console.log(`  ${pc.dim('- removed')}  ${r.id}: was ${r.was}`);
  }
  console.log();
}
