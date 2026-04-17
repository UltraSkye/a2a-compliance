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

Early but usable. Coverage today:

- Agent Card: reachability, schema, content-type, URL shape
- JSON-RPC 2.0 envelope: parse-error, invalid-request, method-not-found
- A2A methods: `tasks/get`, `message/send`, `message/stream` (SSE)
- Security: SSRF probe on every card URL, HTTPS enforcement,
  CORS wildcard-with-credentials

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full
roadmap and the check-id taxonomy.

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

# Shields-style SVG badge for your README
pnpm cli run https://your-agent.example.com --badge ./badge.svg

# Snapshot the current compliance state and fail later on regressions
pnpm cli run https://your-agent.example.com --snapshot-out ./baseline.json
pnpm cli run https://your-agent.example.com --snapshot    ./baseline.json
```

### GitHub Action

```yaml
- uses: UltraSkye/a2a-compliance@v1
  with:
    url: https://agent.example.com
    junit: ./reports/a2a.junit.xml
    badge: ./badges/a2a.svg
```

See [`apps/action/README.md`](./apps/action/README.md) for all inputs and
outputs.

### Interactive dashboard

A Next.js app lives in `apps/web`. Paste a URL into the form and get the
same report the CLI produces:

```bash
pnpm -r --filter=./packages/* build   # core/schemas/cli must be built once
pnpm --filter @a2a-compliance/web dev
# → http://localhost:3000
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
| [`packages/core`](./packages/core)       | Assertion engine + reporters (JSON, JUnit, badge SVG) |
| [`packages/cli`](./packages/cli)         | `a2a-compliance` command-line |
| [`apps/web`](./apps/web)                 | Next.js 15 dashboard |
| [`apps/action`](./apps/action)           | GitHub composite Action |

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
