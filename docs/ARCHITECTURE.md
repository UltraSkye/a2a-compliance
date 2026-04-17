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
- `id` — stable, dotted identifier (`card.schema`, `protocol.jsonRpcShape`)
- `severity` — `must` | `should` | `info` (maps to RFC 2119)
- `status` — `pass` | `fail` | `warn` | `skip`
- `message`, `evidence` — optional diagnostic payload

Exit code policy (`--fail-on`):
- `must` (default) — fail the process only if a MUST-level check failed
- `any` — fail on any failure (including SHOULD warnings)
- `never` — always exit 0 (useful for reporting-only runs)

## Roadmap

1. **Week 1–2** — Agent Card validator (this scaffold).
2. **Week 3** — Protocol conformance: `message/send`, `tasks/get`, SSE
   streaming, JSON-RPC error codes.
3. **Week 4** — Security checks: SSRF / DNS rebinding probe, TLS cert
   hygiene, OAuth discovery sanity.
4. **Week 5** — Next.js dashboard + GitHub Action wrapper.
5. **Week 6** — DX polish: `init` command, snapshot/regression mode,
   versioned spec selector.
6. **Week 7** — Public launch.
