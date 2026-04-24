# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

## [0.3.3] - 2026-04-24

### Security

Multi-pass security audit with concrete fixes across `core`, `mcp`,
the hosted web dashboard, CI/CD, and Helm chart.

- **DNS-rebinding TOCTOU closed end-to-end.** `RunOptions.pinDns` is
  now plumbed through `runFullChecks` / `runCardChecks` to every
  `fetchWithTimeout` call in the probe chain. The hosted web API
  and the MCP server both opt in with `pinDns: true` so the
  SSRF-guard → actual-fetch gap that SECURITY.md previously listed
  as a residual risk is closed at the library layer.
- **MCP SSRF gate.** `run_compliance` / `validate_agent_card` now
  reject non-http(s) URLs and private-space targets before dispatch,
  preventing an LLM tricked by prompt injection from turning the MCP
  server into an internal-network probe. Input length caps on all
  MCP tool schemas.
- **Web API internal-IP leak closed.** `/api/check` no longer echoes
  error messages that may embed hostnames or IPs discovered behind
  the SSRF guard (e.g. a public URL 302-ing to `10.0.0.5`). Errors
  are logged server-side and the client gets a generic
  `"probe failed"` reply.
- **OpenTelemetry credential leak.** `withRunSpan` now runs the
  `target` URL through `redactUrl` before setting the
  `a2a.target` span attribute, preventing `user:pass@` /
  `?token=` leakage into external OTel backends.
- **Rate limit on `/api/check`.** In-process token bucket, 10 req /
  60 s per IP, `TRUST_PROXY=1` opt-in for `X-Forwarded-For`.
  Returns `429` with `Retry-After`.
- **Nonce-based CSP.** `middleware.ts` generates a per-request
  nonce; `script-src` drops `'unsafe-inline'` in favour of
  `'nonce-...' 'strict-dynamic'`. `HSTS`, `COOP`, `COEP`, `CORP`
  added alongside the existing defence-in-depth headers.
- **Problem-matcher injection closed.** CLI's `--problem-matcher`
  output now neutralises `::` sequences inside agent-controlled
  `message` strings so a hostile endpoint can't forge extra
  annotation fields on GitHub PRs.
- **Helm chart NetworkPolicy** template, opt-in via
  `networkPolicy.enabled: true`. Egress denies RFC 1918 /
  link-local / CGNAT / cloud-metadata to provide the
  network-layer defence-in-depth SECURITY.md recommends.
- **`spec-drift.yml` workflow fixed.** The inlined Node script
  mixed `require()` and top-level `await`, failing Node 22+.
  Wrapped in an async IIFE so the weekly drift probe actually
  runs.
- **`cosign` bootstrap hardened.** `publish-images.yml` used
  `curl | chmod | sudo mv` with no checksum; replaced with the
  official `sigstore/cosign-installer@v3` action.
- **`homebrew.yml` no longer embeds the PAT in the clone URL.**
  Token is now passed via `http.extraheader` so it doesn't land
  in `.git/config` or command traces.
- **License compliance.** `packages/mcp/LICENSE` was a symlink
  that `npm pack` doesn't follow (`pnpm pack` does), so a future
  switch to npm tooling would have silently published the
  package without its LICENSE. Replaced with a real file.
- **`@a2a-compliance/mcp` keywords** bumped 23 → 50 to match the
  rest of the workspace (findability on npm).
- **CI hygiene.** Workflow-level `permissions: contents: read`
  default on `ci.yml`; weekly Trivy schedule; Dependabot docker
  coverage extended to `/packages/cli` and
  `/examples/reference-agent`; duplicate web typecheck job
  removed; `scripts/release.sh` pack-preview now includes
  `packages/mcp`.
- **Auth probe message fix.** `auth.anonChallenge` rendered an
  empty `${''}` in its failure message instead of the declared
  schemes list — now shows `[oauth2, bearer]`.

### Added

- `ProbeOptions` type exported from `@a2a-compliance/core`.
- Rate-limit module (`apps/web/app/api/check/rate-limit.ts`).
- Next.js middleware (`apps/web/middleware.ts`).
- Helm `NetworkPolicy` template.
- CLI regression test for problem-matcher injection.
- Core regression tests for `pinDns` plumbing.
- MCP regression test for URL gating.
- `429` response documented in `apps/web/openapi.yaml`.

## [0.3.2] - 2026-04-18

### Security

Closes every open GitHub code-scanning alert (7 total) surfaced by
CodeQL + Trivy against the v0.3.1 tree.

- **Reference agent** (`examples/reference-agent/server.js`) no longer
  echoes the raw `Error.message` from its internal-error catch block
  back to the client — that path could leak internal file paths,
  module versions, or upstream endpoint fragments. Logs server-side,
  returns a generic `"internal error"` instead. Fixes CodeQL
  `js/stack-trace-exposure`.
- **Reference agent Dockerfile** drops from `root` to the built-in
  `node` user before starting the server. Fixes Trivy `DS-0002`
  *Image user should not be 'root'*.
- **CLI Dockerfile** declares `HEALTHCHECK NONE` — the CLI is a
  one-shot probe with no long-lived service state to health-check,
  so `NONE` is the semantically correct answer. Fixes Trivy
  `DS-0026` *No HEALTHCHECK defined*.
- **Helm chart** (`charts/a2a-compliance-web/`):
  - `runAsUser` / `runAsGroup` / `fsGroup` raised to `10001`
    (Trivy `KSV-0020` / `KSV-0021` — IDs ≤ 10000 may collide with
    system accounts; 10001+ is also easier to spot in audit logs).
  - Every template resource declares `namespace: {{ .Release.Namespace }}`
    explicitly (Trivy `KSV-0110` — no more silent `default`).
  - `image.digest` added to `values.yaml`. When set, the Deployment
    uses the digest form (`repo@sha256:...`) instead of a mutable
    tag, closing Trivy `KSV-0125` *Restrict container images to
    trusted registries* for operators who pin.

### Bumped

- `@a2a-compliance/{schemas,core,cli,mcp}` → 0.3.2
- `charts/a2a-compliance-web` → 0.3.2

## [0.3.1] - 2026-04-18

### Fixed

- **`packages/cli/Dockerfile`** — restricted the build step from
  `pnpm -r --filter=./packages/* build` to
  `pnpm --filter '@a2a-compliance/cli...' build`. The wildcard tried
  to compile the new mcp package whose `@modelcontextprotocol/sdk`
  and `zod` deps weren't installed in the CLI image (the install
  step had already filtered them out), blocking multi-arch image
  publishing on the v0.3.0 tag.
- **`apps/web/Dockerfile`** — same fix: build scoped to
  `@a2a-compliance/web...`. Also added the missing
  `packages/mcp/package.json` COPY so pnpm's frozen-lockfile check
  doesn't fall back to an unlocked resolution path.
- **`.github/workflows/release.yml`** — added
  `@a2a-compliance/mcp` to the npm publish list. v0.3.0 shipped the
  package on the filesystem but the release workflow predated it
  and skipped publishing.

### Bumped

- `@a2a-compliance/schemas` → 0.3.1
- `@a2a-compliance/core` → 0.3.1
- `@a2a-compliance/cli` → 0.3.1
- `@a2a-compliance/mcp` → 0.3.1

## [0.3.0] - 2026-04-18

### Added — packaging + distribution

- **`packages/cli/Dockerfile`** — 4-stage alpine build. Published to
  `ghcr.io/ultraskye/a2a-compliance-cli` for `linux/amd64` +
  `linux/arm64`.
- **GHCR publish workflow** (`.github/workflows/publish-images.yml`)
  with multi-arch builds, SLSA build-provenance, SBOM (SPDX JSON),
  and cosign keyless signing via GitHub OIDC → Sigstore. Covers the
  CLI, the reference agent, and the web dashboard images. No other
  A2A-ecosystem project ships signed + attested images.
- **HEALTHCHECK** in `apps/web/Dockerfile`.
- **Trivy filesystem + config scan** on every PR/push, SARIF →
  code-scanning. Fails CI on CRITICAL/HIGH with an available fix.
- **`@a2a-compliance/mcp`** — new package, Model Context Protocol
  server for Claude Desktop / Cursor / Codex / Cline / Windsurf /
  Continue. 5 tools over stdio (`run_compliance`,
  `validate_agent_card`, `list_checks`, `explain_check`,
  `ssrf_check_url`).
- **OpenTelemetry opt-in instrumentation** — `telemetry.ts` wraps
  `runCardChecks` / `runFullChecks` in a parent span; `withCheckSpan`
  helper exposed. `@opentelemetry/api` resolved via indirect dynamic
  import — zero cost when absent.
- **Standalone binaries** (`.github/workflows/binaries.yml`): bun
  `--compile` produces darwin / linux / windows × amd64 / arm64
  single-file binaries attached to each GitHub release.
- **Homebrew tap workflow** (`.github/workflows/homebrew.yml`):
  auto-renders a `Formula.rb` pointing at release binaries and
  commits it to `UltraSkye/homebrew-a2a-compliance`.
- **Nix flake** (`flake.nix`) — `nix run
  github:UltraSkye/a2a-compliance -- run <url>` and a `nix develop`
  shell.
- **Helm chart** at `charts/a2a-compliance-web/` v0.3.0 — Deployment +
  Service + optional Ingress, read-only rootfs, non-root user.
- **OpenAPI 3.1 spec** for the dashboard at `apps/web/openapi.yaml`.
- **GitHub problem matcher** (`.github/problem-matchers/…`) +
  `run --problem-matcher` flag for inline PR annotations without
  SARIF / code-scanning.

### Added — AI-agent discoverability

- **`AGENTS.md`** at repo root — canonical quick-reference for AI
  coding agents (Claude Code, Cursor, Copilot, Codex, Aider).
- **`llms.txt`** per [llmstxt.org](https://llmstxt.org) — plain
  hierarchical index for LLM fetches.
- Per-package READMEs rewritten to v0.3 feature set; npm keywords
  expanded across all four packages (~50 terms each).

### Added — docs

- **Top-level README repositioned** — operator-facing frame with an
  honest comparison matrix against `a2aproject/a2a-tck`.

### Changed

- CI + CodeQL trigger on every PR regardless of base branch — stacked
  PRs no longer lose their check matrix.
- Coverage floors lowered to accommodate deliberately-undercovered
  modules (`telemetry.ts`, `dns-pin.ts` socket-only paths): statements
  88, branches 80, functions 91, lines 89.

### Bumped

- `@a2a-compliance/schemas` → 0.3.0
- `@a2a-compliance/core` → 0.3.0
- `@a2a-compliance/cli` → 0.3.0
- `@a2a-compliance/mcp` → 0.3.0 (new)

## [0.2.0] - 2026-04-18

### Added
- Check metadata moved into a central catalog
  (`packages/core/src/catalog.ts`). Every `CheckResult` now carries
  `category` (`card` | `protocol` | `methods` | `security` | `spec` |
  `auth`) and an optional `specRef` pointing into the upstream A2A /
  JSON-RPC spec. Populated automatically by the runner.
- Compliance tier on every report: `NON_COMPLIANT` / `MANDATORY` /
  `RECOMMENDED` / `FULL_FEATURED`. Surfaced in JSON, JUnit properties,
  SARIF run.properties, badge (`--badge --tier`), and human output.
- **Capability-gated severity promotion.** `rpc.messageStream.contentType`
  and the `rpc.pushNotifications.*` probes escalate from SHOULD to
  MUST when the card declares the corresponding capability — the
  "false advertising" rule.
- **Auth probe** (`auth.anonChallenge`, `auth.discovery`). Verifies
  that cards declaring a non-`none` security scheme actually
  challenge unauthenticated requests; runs OAuth / OIDC discovery
  reachability when `oauth2` or `openIdConnect` is declared.
- **Batch JSON-RPC check** (`rpc.batch`). Accepts array response or
  single `-32600` rejection, fails on single unwrapped non-array.
- **DNS-rebinding pin** in `fetchWithTimeout({ pinDns: true })`.
  Resolves the hostname once, then feeds undici a `connect.lookup`
  that returns the pinned IP — closes the TOCTOU documented in
  SECURITY.md.
- **SARIF 2.1.0 reporter**: `--sarif <path>`. Rules derived from the
  catalog; findings map category + severity + status to SARIF levels
  (`error` / `warning` / `note`). Drops into GitHub code-scanning.
- **CLI catalog introspection.** `a2a-compliance list` prints every
  check id grouped by category; `a2a-compliance explain <id>` prints
  description + spec reference for a single id.
- **Output filters on `run`.** `--category <name...>` and
  `--only <id...>` narrow the emitted checks without changing the
  probe set; the tier is recomputed over the filtered slice.
- **Reference A2A agent** at `examples/reference-agent/` — zero-dep
  Node server, spec-compliant, wired into `docker-compose --profile
  demo` and `scripts/e2e.sh` as a FULL_FEATURED dogfood target.
- **A2A Security Top 10** doc (`docs/A2A_SECURITY_TOP_10.md`): ten
  classes of defect we see in the wild, mapped to check ids.
- **Spec-drift tracker** (`.github/workflows/spec-drift.yml`): weekly
  cron that hashes upstream A2A artefacts against
  `packages/schemas/spec-baseline.json` and opens an issue on drift.

### Changed
- `ComplianceReport.summary` now includes `tier`. `ComplianceSummary`
  is exported from `@a2a-compliance/core` as a named type.
- JUnit reporter emits `<properties>` with `tier` and `specVersion`.
- `runFullChecks` now accepts `skipAuth?: boolean`. `--skip-auth` CLI
  flag mirrors.
- `readme` repositioned: honest comparison matrix vs
  `a2aproject/a2a-tck`, operator-facing frame.

### Added (dependencies)
- `undici@^8.1.0` as a direct dep of `@a2a-compliance/core` for the
  DNS-rebinding pin dispatcher.

## [0.1.0] - 2026-04-17

### Added
- Compliance test kit for A2A (Agent2Agent) protocol endpoints
- Agent Card validation (reachability, JSON, schema, Content-Type,
  URL shape, skills presence, `protocolVersion` declaration)
- JSON-RPC 2.0 envelope conformance probes: parse-error, invalid
  request, method-not-found, `tasks/get`, `tasks/resubscribe`
- Method-level probes for `message/send` (v1.0) / `tasks/send` (v0.3)
  and the corresponding stream variants
- Push-notification config round-trip (capability-gated)
- Security checks: HTTPS enforcement, SSRF guard (literal IPs,
  private ranges, localhost, cloud metadata), CORS wildcard-with-credentials
- Spec-version-aware probing — method names adapt to the
  `protocolVersion` declared by the agent card (v0.3 and v1.0 today)
- Response size cap (2 MB default) on every outbound HTTP call
  to prevent OOM from oversized agent cards
- JUnit XML, JSON, SVG badge, and snapshot reporters
- `scripts/e2e.sh` end-to-end verification against mock agents
- Next.js dashboard with SSRF ingress guard (`apps/web`)
- GitHub composite action (`apps/action`)
- Docker support: multi-stage Dockerfile + docker-compose with a
  `demo` profile that ships three reference mock agents

### Tested against
- Google's official `a2aproject/a2a-samples` helloworld agent (Python,
  declared `protocolVersion: 0.3`) — surfaces the v0.3/v1.0 method
  coverage gap in the reference implementation
