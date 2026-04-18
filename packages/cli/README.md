# @a2a-compliance/cli

> **Command-line compliance test kit + security audit for
> [A2A (Agent2Agent) protocol](https://a2a-protocol.org/) endpoints.**
> Point it at a URL, get a graded verdict (`NON_COMPLIANT` /
> `MANDATORY` / `RECOMMENDED` / `FULL_FEATURED`) in seconds, wire the
> exit code into CI. JSON, JUnit, SARIF 2.1.0, SVG badge, snapshot diff.

[![npm](https://img.shields.io/npm/v/%40a2a-compliance%2Fcli.svg)](https://www.npmjs.com/package/@a2a-compliance/cli)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/UltraSkye/a2a-compliance/blob/main/LICENSE)

Part of [`a2a-compliance`](https://github.com/UltraSkye/a2a-compliance)
— the operator-facing companion to
[`a2aproject/a2a-tck`](https://github.com/a2aproject/a2a-tck) (which
certifies SDK implementations). **This tool monitors your deployment.**

## Install

```bash
# one-shot, no install
npx @a2a-compliance/cli run https://your-agent.example.com

# or add globally
npm i -g @a2a-compliance/cli
a2a-compliance run https://your-agent.example.com
```

Node 22.10+ required.

## Commands

```bash
a2a-compliance run <url>           # full run (card + protocol + security + auth)
a2a-compliance card <url>          # card-only, faster
a2a-compliance list                # list every check id, grouped by category
a2a-compliance explain <check-id>  # full docs + spec reference for one check
```

## What it checks

- **Agent Card** — reachability at `/.well-known/agent-card.json`,
  valid JSON, Zod-schema conformance, Content-Type, URL shape, skills
  presence, declared `protocolVersion`.
- **JSON-RPC 2.0 envelope** — parse-error (-32700), invalid-request
  (-32600), method-not-found (-32601), batch handling.
- **A2A method set** — `message/send`, `message/stream`, `tasks/get`,
  `tasks/cancel`, `tasks/resubscribe`, `tasks/pushNotificationConfig/*`.
  Method names auto-adapt to the `protocolVersion` declared by the
  card (A2A v0.3 and v1.0 supported today). Capability-gated checks
  promote from SHOULD to MUST when the card declares the capability
  — false-advertising detection.
- **Auth** — anonymous-challenge probe (expect 401+`WWW-Authenticate`
  or a typed JSON-RPC error when a non-`none` scheme is declared),
  OAuth / OIDC discovery reachability.
- **Security** — SSRF probe on every URL in the card, HTTPS
  enforcement, CORS `*` combined with credentials, redirect-chain
  re-check, DNS-rebinding pinning in the HTTP client.

Every report ends with a **compliance tier**: `NON_COMPLIANT` /
`MANDATORY` / `RECOMMENDED` / `FULL_FEATURED`.

For the full threat catalog, see the [A2A Security Top 10](https://github.com/UltraSkye/a2a-compliance/blob/main/docs/A2A_SECURITY_TOP_10.md).

## Common invocations

```bash
# Full run
a2a-compliance run <url>

# CI artefacts
a2a-compliance run <url> --json   > report.json
a2a-compliance run <url> --junit  ./report.junit.xml
a2a-compliance run <url> --sarif  ./report.sarif    # → GitHub code-scanning
a2a-compliance run <url> --badge  ./badge.svg

# Snapshot a known-good state, then fail on regression
a2a-compliance run <url> --snapshot-out ./baseline.json
a2a-compliance run <url> --snapshot    ./baseline.json

# Narrow to categories / ids
a2a-compliance run <url> --category security --category auth
a2a-compliance run <url> --only sec.ssrf --only sec.tls.https

# Skip expensive blocks
a2a-compliance run <url> --skip-protocol    # card-only
a2a-compliance run <url> --skip-security
a2a-compliance run <url> --skip-auth
```

## Exit-code policy (`--fail-on`)

| Value                | Exit non-zero when…                |
|----------------------|------------------------------------|
| `must` *(default)*   | any MUST-level check failed        |
| `any`                | any check failed                   |
| `never`              | never (reporting-only runs)        |

Snapshot regressions always fail the build unless `--fail-on never`.

## GitHub Actions

Composite action:

```yaml
- uses: UltraSkye/a2a-compliance@v1
  with:
    url: https://agent.example.com
    junit: ./reports/a2a.junit.xml
    badge: ./badges/a2a.svg
```

Or call the CLI directly + drop SARIF into code-scanning:

```yaml
- run: npx @a2a-compliance/cli run ${{ env.AGENT_URL }} \
         --sarif ./a2a.sarif --fail-on never
- uses: github/codeql-action/upload-sarif@v3
  with: { sarif_file: ./a2a.sarif }
```

Drop-in workflows for GitHub, GitLab, and CircleCI live in
[`examples/ci-integrations/`](https://github.com/UltraSkye/a2a-compliance/tree/main/examples/ci-integrations).

## Sample output

```
A2A compliance — https://agent.example.com

  ✓ [MUST]   Agent card reachable at /.well-known/agent-card.json
  ✓ [MUST]   Agent card conforms to A2A schema
  ✓ [SHOULD] Agent card declares a known protocolVersion (v1.0)
  ✓ [MUST]   Rejects invalid JSON with -32700 Parse error
  ✓ [SHOULD] Handles a JSON-RPC batch request
  ✓ [MUST]   message/send returns a valid JSON-RPC response
  ✓ [MUST]   message/stream responds with text/event-stream
  - [INFO]   Push notifications capability not declared — skipping
  ✗ [MUST]   All URLs declared in the agent card use HTTPS
      cleartext URLs: http://agent.example.com/a2a

  16 passed, 0 warnings, 1 failed  tier: NON_COMPLIANT
```

## Related packages

- [`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core) — library / programmatic API
- [`@a2a-compliance/schemas`](https://www.npmjs.com/package/@a2a-compliance/schemas) — Zod schemas alone

## See also

- 🏠 [Repository + full docs](https://github.com/UltraSkye/a2a-compliance)
- 🤖 [`AGENTS.md`](https://github.com/UltraSkye/a2a-compliance/blob/main/AGENTS.md) — AI-agent quick reference
- 🛡️ [A2A Security Top 10](https://github.com/UltraSkye/a2a-compliance/blob/main/docs/A2A_SECURITY_TOP_10.md)
- 🧪 [Reference A2A agent](https://github.com/UltraSkye/a2a-compliance/tree/main/examples/reference-agent) — zero-dep, spec-compliant, for local testing

## License

MIT.
