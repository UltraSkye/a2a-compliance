# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

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
