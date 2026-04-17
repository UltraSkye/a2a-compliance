# a2a-compliance

> Compliance test kit and validator for [A2A (Agent2Agent) protocol][a2a]
> endpoints. Automated, CI-friendly, scriptable.

[a2a]: https://a2a-protocol.org/

## Why

The A2A protocol maintainers reported that [real-world endpoint compliance
is near zero][issue-1755] even though many sites now advertise A2A
support. Today there is no automated way to verify whether an A2A endpoint
actually implements the spec it claims to.

This project fills that gap: a portable test suite you can run against any
A2A endpoint, locally or in CI, with machine-readable reports and a
human-readable summary.

[issue-1755]: https://github.com/a2aproject/A2A/issues/1755

## Status

Very early. Agent Card validator lands in week 1–2; protocol and
security checks in weeks 3–4. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
for the full roadmap.

## Quick start

```bash
pnpm install
pnpm build

# Full compliance run: agent card + live JSON-RPC protocol conformance
pnpm cli run https://your-agent.example.com

# Card-only (faster, no live probes)
pnpm cli card https://your-agent.example.com
```

CI-friendly outputs:

```bash
# Machine-readable JSON on stdout
pnpm cli run https://your-agent.example.com --json > report.json

# JUnit XML (drop straight into GitHub Actions, GitLab, Jenkins result viewers)
pnpm cli run https://your-agent.example.com --junit ./report.junit.xml
```

Exit code policy is controlled by `--fail-on`:

| Value        | Exit non-zero when…                     |
|--------------|------------------------------------------|
| `must` *(default)* | any MUST-level check failed       |
| `any`        | any check failed or warned              |
| `never`      | never (reporting-only runs)             |

## Repository layout

This is a pnpm workspace monorepo.

| Package | Description |
|---------|-------------|
| [`packages/schemas`](./packages/schemas) | Zod schemas for the A2A spec |
| [`packages/core`](./packages/core)       | Assertion engine + test runner |
| [`packages/cli`](./packages/cli)         | `a2a-compliance` command-line |
| [`apps/web`](./apps/web)                 | (planned) Next.js dashboard |

## Development

Requirements: Node 20.11+, pnpm 10+.

```bash
pnpm install          # install all workspaces
pnpm typecheck        # tsc --noEmit across packages
pnpm lint             # biome check
pnpm test             # vitest run
pnpm build            # tsc build across packages
```

Scripts are transparent — no custom wrappers. Run any package's script
directly: `pnpm --filter @a2a-compliance/core test`.

## License

MIT. See [LICENSE](./LICENSE).
