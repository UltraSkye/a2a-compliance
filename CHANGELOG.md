# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

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
