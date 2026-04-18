import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Category, CheckResult, ComplianceReport, SnapshotDiff } from '@a2a-compliance/core';
import {
  diffSnapshot,
  hasRegressions,
  parseSnapshot,
  runFullChecks,
  toBadgeSvg,
  toJUnitXml,
  toSarif,
  toSnapshot,
} from '@a2a-compliance/core';
import type { Command } from 'commander';
import { Option } from 'commander';
import pc from 'picocolors';
import type { FailOn } from '../output.js';
import { decideExit, printHuman } from '../output.js';

const KNOWN_CATEGORIES: readonly Category[] = [
  'card',
  'protocol',
  'methods',
  'security',
  'spec',
  'auth',
];

interface RunOptions {
  json?: boolean;
  junit?: string;
  badge?: string;
  sarif?: string;
  snapshot?: string;
  snapshotOut?: string;
  failOn?: FailOn;
  skipProtocol?: boolean;
  skipSecurity?: boolean;
  skipAuth?: boolean;
  category?: string[];
  only?: string[];
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
    .option('--sarif <path>', 'also write a SARIF 2.1.0 report to <path> for code-scanning')
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
    .option('--skip-auth', 'skip auth probe (anon-challenge + OAuth discovery)')
    .option(
      '--category <name...>',
      'narrow output to one or more categories (card, protocol, methods, security, spec, auth)',
    )
    .option('--only <id...>', 'narrow output to specific check ids (exact match)')
    .action(async (url: string, opts: RunOptions) => {
      const full = await runFullChecks(url, {
        skipProtocol: opts.skipProtocol === true,
        skipSecurity: opts.skipSecurity === true,
        skipAuth: opts.skipAuth === true,
      });

      const report = applyFilters(full, opts);

      const diff = opts.snapshot ? compareSnapshot(report, opts.snapshot) : undefined;

      if (opts.json) {
        console.log(JSON.stringify(diff ? { ...report, snapshotDiff: diff } : report, null, 2));
      } else {
        printHuman(report.target, report.checks, report.summary.tier);
        if (diff) printDiff(diff);
      }

      if (opts.junit) writeArtefact('JUnit report', opts.junit, toJUnitXml(report), opts.json);
      if (opts.badge) writeArtefact('Badge SVG', opts.badge, toBadgeSvg(report), opts.json);
      if (opts.sarif) writeArtefact('SARIF report', opts.sarif, toSarif(report), opts.json);
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

function applyFilters(report: ComplianceReport, opts: RunOptions): ComplianceReport {
  const cats = opts.category?.filter((c): c is Category =>
    (KNOWN_CATEGORIES as readonly string[]).includes(c),
  );
  const ids = opts.only;
  if (!cats?.length && !ids?.length) return report;

  const kept = report.checks.filter((c: CheckResult) => {
    const catOk = !cats?.length || (c.category !== undefined && cats.includes(c.category));
    const idOk = !ids?.length || ids.includes(c.id);
    return catOk && idOk;
  });

  return { ...report, checks: kept, summary: recomputeSummary(kept, report.summary.tier) };
}

function recomputeSummary(
  checks: CheckResult[],
  _fallbackTier: ComplianceReport['summary']['tier'],
): ComplianceReport['summary'] {
  // Re-tier over the filtered set — the subset's tier is more useful
  // than carrying the full-run tier across a `--category security` slice.
  let fail = 0;
  let pass = 0;
  let warn = 0;
  let skip = 0;
  for (const c of checks) {
    if (c.status === 'pass') pass += 1;
    else if (c.status === 'fail') fail += 1;
    else if (c.status === 'warn') warn += 1;
    else skip += 1;
  }
  return {
    total: checks.length,
    pass,
    fail,
    warn,
    skip,
    tier: tierLocal(checks),
  };
}

function tierLocal(checks: CheckResult[]): ComplianceReport['summary']['tier'] {
  if (checks.some((c) => c.severity === 'must' && c.status === 'fail')) return 'NON_COMPLIANT';
  if (checks.some((c) => c.severity === 'should' && (c.status === 'fail' || c.status === 'warn')))
    return 'MANDATORY';
  if (checks.some((c) => c.status === 'skip' && c.severity !== 'info')) return 'RECOMMENDED';
  return 'FULL_FEATURED';
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
  // One syscall (read) rather than stat-then-read avoids the filesystem
  // TOCTOU race CodeQL flags on js/file-system-race. The cap is then
  // applied to the bytes we actually hold, so an attacker swapping the
  // file mid-operation can't get us to accept oversized content.
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
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
  const byteSize = Buffer.byteLength(raw, 'utf8');
  if (byteSize > MAX_SNAPSHOT_BYTES) {
    throw new Error(
      `snapshot file ${path} is ${byteSize} bytes, above the ${MAX_SNAPSHOT_BYTES}-byte cap`,
    );
  }
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
