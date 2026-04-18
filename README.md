# a2a-compliance

[![CI](https://github.com/UltraSkye/a2a-compliance/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UltraSkye/a2a-compliance/actions/workflows/ci.yml)
[![CodeQL](https://github.com/UltraSkye/a2a-compliance/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/UltraSkye/a2a-compliance/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm — cli](https://img.shields.io/npm/v/%40a2a-compliance%2Fcli?label=%40a2a-compliance%2Fcli)](https://www.npmjs.com/package/@a2a-compliance/cli)
[![npm — core](https://img.shields.io/npm/v/%40a2a-compliance%2Fcore?label=%40a2a-compliance%2Fcore)](https://www.npmjs.com/package/@a2a-compliance/core)


> Operational compliance monitor for [A2A (Agent2Agent) protocol][a2a]
> endpoints. Runs in CI, fits into GitHub code-scanning, flags
> regressions before they ship.

[a2a]: https://a2a-protocol.org/

## Why

The A2A protocol maintainers reported that [real-world endpoint compliance
is near zero][issue-1755] even though many sites now advertise A2A
support. Operators need a fast way to check whether the agent they just
deployed still meets spec — and whether it stays that way across
deployments.

`a2a-compliance` fills that gap. It is the **operational** side of A2A
compliance: run it against any URL, get a graded verdict in seconds,
wire the exit code into CI, surface regressions on PRs.

If you are writing an **A2A SDK** (not deploying an agent), the official
[`a2aproject/a2a-tck`][tck] is the authoritative conformance test kit.
The two projects overlap intentionally, but cover different audiences:

| | `a2a-compliance` | `a2aproject/a2a-tck` |
|---|---|---|
| Audience | Operators, platforms, CI | SDK authors |
| Install | `npx @a2a-compliance/cli` — 30 s | `git clone`, Python venv, YAML config |
| Output | JSON, JUnit, SARIF, SVG badge, snapshot diff | JSON compliance report |
| Regression tracking | ✅ snapshot baseline + CI gate | — |
| CI integration | GitHub Action + SARIF → code-scanning | pytest |
| Security probes | ✅ SSRF, TLS, CORS, DNS-rebinding pin, auth-challenge | — |
| Compliance tiering | `NON_COMPLIANT` / `MANDATORY` / `RECOMMENDED` / `FULL_FEATURED` | `NON_COMPLIANT` / `MANDATORY` / `RECOMMENDED` / `FULL_FEATURED` |
| Transport coverage (today) | JSON-RPC 2.0 (v0.3 + v1.0) | JSON-RPC, gRPC, REST |

Short version: **TCK certifies your SDK. `a2a-compliance` monitors your
deployment.**

[issue-1755]: https://github.com/a2aproject/A2A/issues/1755
[tck]: https://github.com/a2aproject/a2a-tck

## What it checks

- **Agent Card** — reachability at `/.well-known/agent-card.json`, valid
  JSON, conformance to the Zod schema, Content-Type, URL shape, skills
  presence, declared `protocolVersion`.
- **JSON-RPC 2.0 envelope** — parse-error, invalid-request, method-not-found,
  batch handling.
- **A2A method set** — `message/send` / `tasks/send`, `message/stream` /
  `tasks/sendSubscribe`, `tasks/get`, `tasks/cancel`, `tasks/resubscribe`,
  push-notification config round-trip. Probe method names adapt to the
  `protocolVersion` declared by the card (v0.3 and v1.0 today).
  Capability-gated checks promote to MUST when the card declares the
  capability — false-advertising detection.
- **Auth** — anon-challenge probe (expect 401+`WWW-Authenticate` or typed
  JSON-RPC error when a non-`none` scheme is declared), OAuth/OIDC
  discovery reachability.
- **Security** — SSRF probe on every URL in the card, HTTPS enforcement,
  CORS wildcard-with-credentials, redirect-chain SSRF re-check,
  DNS-rebinding pinning in the HTTP client.

For the full threat catalog tied back to checks, see
[`docs/A2A_SECURITY_TOP_10.md`](./docs/A2A_SECURITY_TOP_10.md).

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full
check-id taxonomy. `npx @a2a-compliance/cli list` prints every check
id at runtime; `npx @a2a-compliance/cli explain <id>` prints full
docs with spec references.

## Quick start — no install

```bash
npx @a2a-compliance/cli run https://your-agent.example.com
```

Card-only (faster, no live probes):

```bash
npx @a2a-compliance/cli card https://your-agent.example.com
```

## CI-friendly outputs

```bash
# Machine-readable JSON on stdout
npx @a2a-compliance/cli run <url> --json > report.json

# JUnit XML — drops straight into GitHub Actions / GitLab / Jenkins
npx @a2a-compliance/cli run <url> --junit ./report.junit.xml

# SARIF 2.1.0 — upload to GitHub code-scanning for PR annotations
npx @a2a-compliance/cli run <url> --sarif ./report.sarif

# Shields-style SVG badge for your README
npx @a2a-compliance/cli run <url> --badge ./badge.svg

# Snapshot the current compliance state and fail later on regressions
npx @a2a-compliance/cli run <url> --snapshot-out ./baseline.json
npx @a2a-compliance/cli run <url> --snapshot    ./baseline.json

# Narrow to one category / set of ids
npx @a2a-compliance/cli run <url> --category security --category auth
npx @a2a-compliance/cli run <url> --only sec.ssrf --only sec.tls.https
```

Exit-code policy is controlled by `--fail-on`:

| Value                | Exit non-zero when…                |
|----------------------|------------------------------------|
| `must` *(default)*   | any MUST-level check failed        |
| `any`                | any check failed                   |
| `never`              | never (reporting-only runs)        |

Snapshot regressions always fail the build unless `--fail-on never`.

## GitHub Action

```yaml
- uses: UltraSkye/a2a-compliance@v1
  with:
    url: https://agent.example.com
    junit: ./reports/a2a.junit.xml
    badge: ./badges/a2a.svg
```

Drop-in workflows for GitHub Actions, GitLab CI, and CircleCI live in
[`examples/ci-integrations/`](./examples/ci-integrations).

## Run against the reference agent

The repo ships a minimal, spec-compliant A2A agent under
`examples/reference-agent/` — zero runtime dependencies, starts in under
a second. Useful for local sanity-checks and for dogfooding `run` end-to-end:

```bash
node examples/reference-agent/server.js &
npx @a2a-compliance/cli run http://localhost:8080 --skip-security
# → 16 passed, tier: FULL_FEATURED
```

## Interactive dashboard

A Next.js app in `apps/web` lets you paste a URL into a form and see the
same report the CLI produces. Run it via docker compose:

```bash
docker compose up -d      # → http://localhost:3000
docker compose down
```

The hosted dashboard refuses to probe private-space URLs (loopback,
RFC 1918, link-local, cloud metadata, localhost) so the container can't
be turned into an SSRF proxy against its deployer's internal network.
See [`SECURITY.md`](./SECURITY.md) for the full threat model.

## Use as a library

Everything the CLI does is exposed programmatically:

```ts
import { runFullChecks, toJUnitXml, hasRegressions } from '@a2a-compliance/core';

const report = await runFullChecks('https://agent.example.com');
console.log(report.summary);   // { total, pass, fail, warn, skip }

// Persist for CI
import { writeFileSync } from 'node:fs';
writeFileSync('report.junit.xml', toJUnitXml(report));
```

Or validate an agent card with nothing but the schema package:

```ts
import { AgentCardSchema } from '@a2a-compliance/schemas';

const parsed = AgentCardSchema.safeParse(await (await fetch(url)).json());
```

`ssrfCheckForUrl` from `@a2a-compliance/core` is usable in your own HTTP
handlers to reject private-space targets — it's the same guard the
hosted dashboard uses at ingress.

## Repository layout

pnpm workspace monorepo.

| Package | Description |
|---------|-------------|
| [`packages/schemas`](./packages/schemas) | Zod schemas for the A2A spec |
| [`packages/core`](./packages/core)       | Assertion engine + reporters (JSON, JUnit, badge SVG, snapshot) |
| [`packages/cli`](./packages/cli)         | `a2a-compliance` command-line |
| [`apps/web`](./apps/web)                 | Next.js 15 dashboard |
| [`apps/action`](./apps/action)           | GitHub composite Action |

## Development

Requirements: Node 22.10+, pnpm 10+.

```bash
pnpm install          # install all workspaces
pnpm build            # tsc build across packages — run before typecheck
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
pnpm test             # vitest run, with coverage thresholds enforced
./scripts/e2e.sh      # full Docker-backed end-to-end verification
```

Contributions welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the check-addition
workflow.

## License

MIT. See [LICENSE](./LICENSE).
