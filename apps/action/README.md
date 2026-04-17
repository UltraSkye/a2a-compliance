# a2a-compliance GitHub Action

Drop-in compliance check for your A2A endpoint. Useful as a gate on PRs that
change your agent card, protocol handling, or auth configuration.

## Usage

```yaml
jobs:
  a2a-compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: UltraSkye/a2a-compliance@v1
        with:
          url: https://agent.example.com
          junit: ./reports/a2a.junit.xml
          badge: ./badges/a2a.svg
```

## Inputs

| Input            | Default | Description                                               |
|------------------|---------|-----------------------------------------------------------|
| `url`            | —       | A2A endpoint base URL (required).                         |
| `fail-on`        | `must`  | `any` / `must` / `never` — exit policy.                   |
| `junit`          | ``      | Optional path to write JUnit XML report.                  |
| `badge`          | ``      | Optional path to write an SVG badge.                      |
| `skip-protocol`  | `false` | Skip live JSON-RPC checks (card-only run).                |
| `skip-security`  | `false` | Skip SSRF / TLS / CORS checks.                            |

## Outputs

| Output   | Description                                          |
|----------|------------------------------------------------------|
| `report` | Path to the JSON compliance report written in tmp.   |

## Notes

This is a composite action — it runs the `@a2a-compliance/cli` npm package
inside the runner, so no Docker image needs to be pulled.
