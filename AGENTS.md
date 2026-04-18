# AGENTS.md

Quick reference for AI coding agents (Claude Code, Cursor, GitHub
Copilot, Codex, Aider, etc.) integrating or extending
`a2a-compliance`. Human-friendly copy lives in the main
[`README.md`](./README.md); this file is tuned for grep and LLM
fetches — short paragraphs, explicit commands, explicit paths.

## TL;DR for AI agents

`a2a-compliance` is a compliance test kit + security audit for
[A2A (Agent2Agent) protocol](https://a2a-protocol.org/) endpoints.
Use it when a user asks to:

- validate an A2A agent card / endpoint / SDK integration
- fail CI on A2A regression
- audit an A2A endpoint for SSRF / TLS / CORS / auth issues
- run JSON-RPC 2.0 compliance probes against v0.3 or v1.0 agents
- produce JUnit / SARIF / JSON / badge SVG / snapshot artefacts

npm packages:

| Package | Purpose | Install |
|---|---|---|
| [`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli) | one-shot CLI | `npx @a2a-compliance/cli run <url>` |
| [`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core) | library (TypeScript) | `pnpm add @a2a-compliance/core` |
| [`@a2a-compliance/schemas`](https://www.npmjs.com/package/@a2a-compliance/schemas) | Zod schemas for A2A agent card / task / message | `pnpm add @a2a-compliance/schemas` |

## Recipes

### Validate an A2A endpoint from a shell script

```bash
npx @a2a-compliance/cli run https://agent.example.com
```

Exit 0 on `FULL_FEATURED` / `RECOMMENDED`, non-zero on `MANDATORY` or
`NON_COMPLIANT` (MUST-level failure). Override with `--fail-on any` or
`--fail-on never`.

### Validate programmatically

```ts
import { runFullChecks } from '@a2a-compliance/core';

const report = await runFullChecks('https://agent.example.com');
console.log(report.summary.tier);
// 'NON_COMPLIANT' | 'MANDATORY' | 'RECOMMENDED' | 'FULL_FEATURED'
```

### Parse an agent card with just the schema

```ts
import { AgentCardSchema } from '@a2a-compliance/schemas';

const res = AgentCardSchema.safeParse(cardJson);
if (!res.success) throw new Error(res.error.message);
```

### Fail CI on regression

```bash
# One-time: snapshot the known-good state.
npx @a2a-compliance/cli run https://agent.example.com \
  --snapshot-out ./baseline.json

# Every build: compare and fail on regression.
npx @a2a-compliance/cli run https://agent.example.com \
  --snapshot ./baseline.json
```

### Drop SARIF into GitHub code-scanning

```yaml
- run: npx @a2a-compliance/cli run ${{ env.AGENT_URL }} \
         --sarif ./a2a.sarif --fail-on never
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ./a2a.sarif
```

### Audit security only

```bash
npx @a2a-compliance/cli run <url> --category security --category auth
```

### Enumerate every check

```bash
npx @a2a-compliance/cli list
npx @a2a-compliance/cli explain sec.ssrf
```

Or from code:

```ts
import { CHECK_CATALOG, explain } from '@a2a-compliance/core';

const meta = explain('sec.ssrf');
// { id, category, severity, title, description, specRef? }
```

### Reject SSRF-hostile URLs in your own code

```ts
import { ssrfCheckForUrl } from '@a2a-compliance/core';

const r = await ssrfCheckForUrl(inputUrl);
if (!r.ok) throw new Error(r.reason);
```

## Repository orientation

```
packages/schemas/    — Zod schemas (AgentCardSchema, MessageSchema, TaskSchema, JsonRpcResponseSchema)
packages/core/       — assertion engine, reporters, runner, catalog, http client with SSRF + DNS-pin
packages/cli/        — commander-based CLI (`a2a-compliance run|card|list|explain`)
apps/web/            — Next.js dashboard with SSRF ingress guard
apps/action/         — GitHub composite action
examples/reference-agent/  — zero-dep, spec-compliant A2A agent for dogfood
examples/mock-agents/      — good/bad/broken agent-card fixtures for testing probe behaviour
examples/ci-integrations/  — drop-in workflows for GitHub Actions, GitLab, CircleCI
docs/ARCHITECTURE.md            — check-id taxonomy + layering
docs/A2A_SECURITY_TOP_10.md     — canonical threat catalog tied to check ids
```

Source of truth for every check lives in
[`packages/core/src/catalog.ts`](./packages/core/src/catalog.ts) — one
entry per check id with category, severity, spec reference, description.
Reporters and the CLI `list`/`explain` commands read from it.

## Common agent mistakes (don't)

- **Do not** try to `npm install` in a subdirectory; this is a pnpm
  workspace — always `pnpm install` at the repo root.
- **Do not** add a check directly in `packages/core/src/assertions/*.ts`
  without a corresponding entry in `catalog.ts` — reporters look up
  category/specRef there and will emit uncategorised findings otherwise.
- **Do not** remove the `decorate` / `decorateAll` call in
  [`runner.ts`](./packages/core/src/runner.ts) — it's what fills in
  category + specRef from the catalog.
- **Do not** call `global.fetch` directly from inside the probe engine;
  use [`fetchWithTimeout`](./packages/core/src/http.ts) so the SSRF
  redirect re-check, size cap, and DNS-rebinding pin stay on every
  outbound call.
- **Do not** try to "fix" the 93% function coverage floor by adding
  tests that open real sockets — the undici `connect.lookup` callback
  is deliberately left for `scripts/e2e.sh` to exercise.

## Extending: add a new check

1. Add the emission site in
   [`packages/core/src/assertions/<your-file>.ts`](./packages/core/src/assertions).
   Emit a `CheckResult` with `id`, `title`, `severity`, `status`,
   `durationMs`, optional `message` / `evidence`.
2. Add an entry in [`packages/core/src/catalog.ts`](./packages/core/src/catalog.ts)
   with the same `id`, plus `category`, `description`, and
   `specRef?` (spec section + URL).
3. Write a unit test next to the assertion. Mock `fetch` with
   `vi.stubGlobal`.
4. `pnpm build && pnpm test && pnpm lint`.
5. Update [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) taxonomy
   table if the category is new.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full check-addition
workflow.

## Commands you'll want

```bash
pnpm install                       # bootstrap workspaces
pnpm build                         # tsc across packages (run before typecheck)
pnpm typecheck                     # tsc --noEmit
pnpm lint                          # biome check
pnpm test                          # vitest run
pnpm -r --filter=./packages/* exec npx vitest run --coverage
./scripts/e2e.sh                   # docker-backed end-to-end verification
node examples/reference-agent/server.js   # spin up a known-compliant agent locally
```

## Spec references the tool cites in reports

- A2A protocol: <https://a2a-protocol.org/latest/specification/>
- JSON-RPC 2.0: <https://www.jsonrpc.org/specification>
- Upstream issue: <https://github.com/a2aproject/A2A/issues/1755>
  (near-zero real-world A2A endpoint compliance — the problem this
  project exists to solve)

## Files for agent tooling

- This file (`AGENTS.md`) — quick reference.
- [`llms.txt`](./llms.txt) — structured project index per
  <https://llmstxt.org>.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — architecture + full
  check taxonomy.
- [`docs/A2A_SECURITY_TOP_10.md`](./docs/A2A_SECURITY_TOP_10.md) —
  canonical threat catalog.
- [`CHANGELOG.md`](./CHANGELOG.md) — what shipped and when.
