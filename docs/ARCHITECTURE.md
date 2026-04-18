# Architecture

## Goal

Automated, CI-friendly compliance testing for A2A (Agent2Agent) protocol
endpoints. Inspired by issue [a2aproject/A2A#1755][issue-1755] ("Near-zero
real-world A2A protocol compliance despite widespread endpoint
advertisement"): endpoints advertise A2A support that they do not actually
implement, and there is no automated way to verify conformance at scale.

[issue-1755]: https://github.com/a2aproject/A2A/issues/1755

## Layout

```
a2a-compliance/
├── packages/
│   ├── schemas/    — Zod schemas derived from the A2A spec (Agent Card, Task, Message)
│   ├── core/       — assertion engine + test runner; emits ComplianceReport
│   └── cli/        — commander-based CLI wrapping core
├── apps/
│   └── web/        — (planned) Next.js dashboard for interactive runs
└── examples/       — fixture agent cards used in tests
```

## Layering

```
          ┌────────────────┐
          │  @.../cli      │   user entry point, exit codes, pretty output
          └────────┬───────┘
                   ▼
          ┌────────────────┐
          │  @.../core     │   runner, assertions, report formatting
          └────────┬───────┘
                   ▼
          ┌────────────────┐
          │  @.../schemas  │   pure types + Zod validators
          └────────────────┘
```

- `schemas` has zero runtime dependencies except Zod. Depend on it from
  anywhere without pulling Node APIs — makes a future browser/edge port
  trivial.
- `core` can run in Node, Bun, Deno, or any env with `fetch`. No explicit
  Node deps.
- `cli` is the only Node-specific package (`process.exit`, `process.argv`).

## Check taxonomy

Every check produces a `CheckResult` with:
- `id` — stable, dotted identifier (`card.schema`, `rpc.parseError`)
- `category` — `card` | `protocol` | `methods` | `security` | `spec` | `auth`
- `severity` — `must` | `should` | `info` (maps to RFC 2119)
- `status` — `pass` | `fail` | `warn` | `skip`
- `specRef?` — `{ section, url }` pointer into the upstream spec
  (populated from the central catalog unless the emission site supplies
  its own)
- `message`, `evidence` — optional diagnostic payload

Each report ends with a **compliance tier** (`ComplianceSummary.tier`):
- `NON_COMPLIANT` — any MUST-level check failed
- `MANDATORY` — all MUSTs pass, some SHOULDs failed or warned
- `RECOMMENDED` — all MUSTs + SHOULDs pass, but some non-info check was skipped
- `FULL_FEATURED` — every emitted check passed

Exit code policy (`--fail-on`):
- `must` (default) — fail the process only if a MUST-level check failed
- `any` — fail on any failure (including SHOULD warnings)
- `never` — always exit 0 (useful for reporting-only runs)

## Catalog

`packages/core/src/catalog.ts` is the single source of truth for every
check: id, default category, default severity, human-readable description,
and upstream spec reference. The runner decorates every `CheckResult` with
its catalog entry so reporters, filters, and downstream tooling see a
uniform shape without each emission site having to repeat the metadata.

Runtime discovery:

```bash
a2a-compliance list               # grouped listing
a2a-compliance list --json        # full JSON catalog
a2a-compliance explain sec.ssrf   # full entry for one id
```

Callable from code:

```ts
import { CHECK_CATALOG, explain, listCheckIds } from '@a2a-compliance/core';
```

## Capability-gated severity

Some checks (push-notification config, streaming) only run when the
agent card declares the relevant capability. When the capability **is**
declared, the severity of those checks is promoted from `should` to
`must` — the "false advertising" rule. An agent that claims
`capabilities.streaming` and then returns JSON instead of
`text/event-stream` lands in `NON_COMPLIANT`, not `MANDATORY`.

## Roadmap

1. **Week 1** — Agent Card validator ✅ *shipped*
2. **Week 2** — JSON-RPC envelope conformance + JUnit reporter ✅ *shipped*
3. **Week 3** — `message/send` happy path + `message/stream` SSE sanity ✅ *shipped*
4. **Week 4** — SSRF, HTTPS, CORS security checks ✅ *shipped*
5. **Week 5** — Next.js dashboard, GitHub Action, badge SVG ✅ *shipped*
6. **Week 6** — Snapshot mode, `tasks/resubscribe`, push-notification
   config round-trip, npm publish prep ✅ *shipped*
7. **Week 7** — Public launch.

## Snapshot mode

Compliance results change over time — regressions are the thing CI is
supposed to catch. The snapshot format is deliberately minimal:

```json
{
  "version": 1,
  "target": "https://agent.example.com",
  "specVersion": "1.0",
  "capturedAt": "2026-04-17T12:00:00.000Z",
  "checks": { "card.reachable": "pass", "rpc.parseError": "pass", ... }
}
```

Only check id → status is recorded — no messages, no durations. That keeps
diffs stable across flaky runs and lets the baseline live in the same repo
as the code that serves the endpoint.

Status transitions are classified by weight (`pass`/`skip` < `warn` <
`fail`):
- `pass → fail` — regression
- `warn → fail` — regression
- `fail → pass` — improvement
- `pass → skip` — neither (a previously covered check that now skipped
  because a capability flag flipped is not a failure, but we record it)

A run with `--snapshot <path>` fails with a non-zero exit code if any
regression exists, independent of `--fail-on`. `--fail-on never` still
suppresses the hard exit for CI integrations that just want diff output.

## Current assertions

| ID | Severity | Category |
|----|----------|----------|
| `card.reachable` | must | card |
| `card.json` | must | card |
| `card.schema` | must | card |
| `card.contentType` | should | card |
| `card.urlAbsolute` | must | card |
| `card.skillsNonEmpty` | must | card |
| `card.protocolVersion` | should | spec |
| `rpc.parseError` | must | protocol |
| `rpc.invalidRequest` | must | protocol |
| `rpc.methodNotFound` | must | protocol |
| `rpc.batch` | should | protocol |
| `rpc.tasksGet.notFound` | should | methods |
| `rpc.tasksResubscribe.notFound` | should | methods |
| `rpc.tasksCancel.notFound` | should | methods |
| `rpc.messageSend.shape` | must | methods |
| `rpc.messageStream.contentType` | should / must (capability-gated) | methods |
| `rpc.pushNotifications.capability` | info | methods (skip marker) |
| `rpc.pushNotifications.set` | must (when declared) | methods |
| `rpc.pushNotifications.get` | must (when declared) | methods |
| `sec.card.fetch` | info | security (skip marker) |
| `sec.tls.https` | must | security |
| `sec.ssrf` | must | security |
| `sec.cors.wildcardWithCreds` | must | security |
| `auth.anonChallenge` | should | auth |
| `auth.discovery` | should | auth |

The two `info`-level rows above are *skip markers* rather than
compliance assertions. They appear only when the runner intentionally
skips a block of checks — for example, `sec.card.fetch` emits `skip`
with a human-readable reason when the agent card itself isn't
reachable, so the full report makes clear the security block wasn't
just silently omitted.

### Handling "tolerated" errors

`message/send` is inherently application-specific — a compliance probe can't
know whether a given agent can meaningfully respond to `"ping"`. We accept
the endpoint as compliant if it either (a) returns a schema-valid Task or
Message, or (b) rejects our probe with a small whitelist of sensible error
codes (`-32602`, `-32603`, `-32004`, `-32005`, `-32006`). Those cases are
reported as **warn** rather than **fail**, so they don't break CI but still
surface in the report.

### Security-check policy

The SSRF probe resolves each URL referenced by the agent card
(`url`, `provider.url`, `documentationUrl`) and fails if any resolution
lands in: loopback (`127.0.0.0/8`, `::1`), link-local
(`169.254.0.0/16`, `fe80::/10`), RFC 1918 (`10/8`, `172.16/12`,
`192.168/16`), carrier-grade NAT (`100.64/10`), ULA (`fc00::/7`), or the
cloud metadata address `169.254.169.254`. Literal IPs are checked
without DNS; hostnames are resolved via Node's `dns.lookup`. The DNS
stub is trusted — true DNS rebinding is out of scope for this check and
is planned for a dedicated probe later.

The CORS check flags the specific browser-spec violation of
`Access-Control-Allow-Origin: *` combined with
`Access-Control-Allow-Credentials: true`.

All security checks are skippable via `--skip-security`; the runner
otherwise includes them in every full run.

### Spec-version adaptation

A2A v0.3 and v1.0 renamed the core methods
(`tasks/send` → `message/send`, `tasks/sendSubscribe` → `message/stream`,
`tasks/pushNotification/*` → `tasks/pushNotificationConfig/*`). Probing
a v0.3 agent with v1.0 method names would produce false negatives —
every method probe would fail with `-32601 Method not found`.

The runner reads `protocolVersion` from the agent card during discovery
and picks the method name set from `packages/core/src/spec.ts`. Current
map:

| key | v0.3 | v1.0 |
|-----|------|------|
| send | `tasks/send` | `message/send` |
| stream | `tasks/sendSubscribe` | `message/stream` |
| get | `tasks/get` | `tasks/get` |
| cancel | `tasks/cancel` | `tasks/cancel` |
| resubscribe | `tasks/resubscribe` | `tasks/resubscribe` |
| pushSet | `tasks/pushNotification/set` | `tasks/pushNotificationConfig/set` |
| pushGet | `tasks/pushNotification/get` | `tasks/pushNotificationConfig/get` |

When the card omits `protocolVersion` or declares a version outside this
set, the `card.protocolVersion` check emits a SHOULD-level warn and the
runner falls back to v1.0 method names.
