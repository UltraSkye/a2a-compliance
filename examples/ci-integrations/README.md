# CI integrations

Copy-paste starting points for running `a2a-compliance` on every commit
against a deployed A2A agent. Each file expects one variable:

- `url` / `A2A_URL` — the base URL of your A2A endpoint.

## What they all have in common

- JUnit XML output is picked up by the CI platform's native "Tests" UI
  (GitHub's test reporter, GitLab's MR widget, CircleCI's Tests tab).
- Exit policy: **`--fail-on must`** — only MUST-severity failures break
  the build. Warnings and `should`-level misses show up in the report
  without blocking merges. Switch to `--fail-on any` when you want
  zero-tolerance.

## Files

| File | For | Notes |
|---|---|---|
| `github-actions.yml` | GitHub Actions | Uses the composite action, uploads badge back to repo |
| `gitlab-ci.yml` | GitLab CI | Runs the CLI directly via npx |
| `circleci.yml` | CircleCI | Same, with CircleCI-native test storage |

Open an issue or PR if your CI isn't covered — examples for Jenkins,
Azure Pipelines, and Buildkite are welcome.

## Library integration

If you need to embed compliance probes inside your own service (feature
flags, onboarding pipeline, trust-registry job), skip the CLI and
`import` the engine directly:

```ts
import { runFullChecks, hasRegressions, toSnapshot, diffSnapshot, parseSnapshot } from '@a2a-compliance/core';
import { readFileSync, writeFileSync } from 'node:fs';

const report = await runFullChecks(agentUrl);
if (report.summary.fail > 0) {
  console.error(`${agentUrl} failed ${report.summary.fail} MUST-level checks`);
}

// Snapshot round-trip to catch regressions in your own CI:
const baselinePath = `./baselines/${encodeURIComponent(agentUrl)}.json`;
writeFileSync(baselinePath, JSON.stringify(toSnapshot(report), null, 2));

const base = parseSnapshot(JSON.parse(readFileSync(baselinePath, 'utf8')));
if (base) {
  const diff = diffSnapshot(base, report);
  if (hasRegressions(diff)) {
    throw new Error('A2A compliance regression detected');
  }
}
```
