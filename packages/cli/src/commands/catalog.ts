import type { CheckMeta } from '@a2a-compliance/core';
import { CHECK_CATALOG, explain, listCheckIds } from '@a2a-compliance/core';
import type { Command } from 'commander';
import pc from 'picocolors';

/**
 * `a2a-compliance list` and `a2a-compliance explain <id>` — operator-
 * facing catalog introspection. `list` is the only place outside the
 * source tree where the full check inventory is documented at runtime;
 * `explain <id>` is the fix-the-failure landing page pointed at by
 * human-readable reports.
 */
export function registerCatalogCommands(program: Command): void {
  program
    .command('list')
    .description('List every check id, category, severity and title.')
    .option('--json', 'output the catalog as JSON')
    .action((opts: { json?: boolean }) => {
      const ids = listCheckIds();
      if (opts.json) {
        const entries = ids.map((id) => CHECK_CATALOG[id]).filter((m): m is CheckMeta => !!m);
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      const cats = new Map<string, CheckMeta[]>();
      for (const id of ids) {
        const meta = CHECK_CATALOG[id];
        if (!meta) continue;
        const bucket = cats.get(meta.category) ?? [];
        bucket.push(meta);
        cats.set(meta.category, bucket);
      }

      for (const [category, items] of [...cats.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      )) {
        console.log(pc.bold(`\n${category}`));
        for (const m of items) {
          const sev = pc.dim(`[${m.severity.toUpperCase()}]`);
          console.log(`  ${pc.cyan(m.id)} ${sev} ${m.title}`);
        }
      }
      console.log();
    });

  program
    .command('explain <id>')
    .description('Show full documentation for a single check id.')
    .option('--json', 'output the entry as JSON')
    .action((id: string, opts: { json?: boolean }) => {
      const meta = explain(id);
      if (!meta) {
        console.error(pc.red(`unknown check id: ${id}`));
        console.error(pc.dim(`  run 'a2a-compliance list' to see all check ids`));
        process.exit(2);
      }

      if (opts.json) {
        console.log(JSON.stringify(meta, null, 2));
        return;
      }

      console.log(`\n${pc.bold(pc.cyan(meta.id))}  ${pc.dim(`[${meta.severity.toUpperCase()}]`)}`);
      console.log(`${pc.dim('Category:')}  ${meta.category}`);
      console.log(`${pc.dim('Title:')}     ${meta.title}\n`);
      console.log(meta.description);
      if (meta.specRef) {
        console.log(`\n${pc.dim('Spec:')} ${meta.specRef.section}`);
        console.log(`       ${pc.underline(meta.specRef.url)}`);
      }
      console.log();
    });
}
