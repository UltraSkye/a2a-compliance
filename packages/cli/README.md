# @a2a-compliance/cli

Command-line driver for the [A2A (Agent2Agent) protocol][a2a] compliance
test kit. Zero-config: point it at an agent URL, get a pass/fail report,
CI-ready artifacts on demand.

[a2a]: https://a2a-protocol.org/

## One-shot (no install)

```bash
npx @a2a-compliance/cli run https://agent.example.com
```

## Install globally

```bash
npm i -g @a2a-compliance/cli
a2a-compliance run https://agent.example.com
```

## Commands

```bash
a2a-compliance run <url>   # full run (card + protocol + security)
a2a-compliance card <url>  # card-level assertions only — faster
```

## Useful flags on `run`

| Flag | Description |
|------|-------------|
| `--json`                 | emit the machine-readable report to stdout |
| `--junit <path>`         | also write a JUnit XML report |
| `--badge <path>`         | also write a Shields-style SVG badge |
| `--snapshot-out <path>`  | capture a regression baseline |
| `--snapshot <path>`      | compare against a baseline; exit 1 on regression |
| `--fail-on <mode>`       | exit-code policy: `any` / `must` (default) / `never` |
| `--skip-protocol`        | skip live JSON-RPC probing |
| `--skip-security`        | skip SSRF / TLS / CORS checks |

## CI example (GitHub Actions)

```yaml
- uses: UltraSkye/a2a-compliance@v1
  with:
    url: https://agent.example.com
    junit: ./reports/a2a.junit.xml
    badge: ./badges/a2a.svg
```

Or call the CLI directly:

```yaml
- run: |
    npx @a2a-compliance/cli run ${{ env.AGENT_URL }} \
      --junit ./reports/a2a.junit.xml \
      --fail-on must
```

## Sample output

```
A2A compliance — https://agent.example.com

  ✓ [MUST]   Agent card reachable at /.well-known/agent-card.json
  ✓ [MUST]   Agent card conforms to A2A schema
  ✓ [SHOULD] Agent card declares a known protocolVersion (v1.0)
  ✓ [MUST]   Rejects invalid JSON with -32700 Parse error
  ✗ [MUST]   message/send returns a valid JSON-RPC response
      unexpected error code -32601: Method not found
  …

  11 passed, 1 warnings, 3 failed
```

## Related

- [`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core) — programmatic API
- [`@a2a-compliance/schemas`](https://www.npmjs.com/package/@a2a-compliance/schemas) — Zod schemas

## License

MIT.
