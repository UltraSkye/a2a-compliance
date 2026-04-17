# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

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
