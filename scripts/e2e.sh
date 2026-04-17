#!/usr/bin/env bash
# End-to-end verification: builds the repo, spins up the web dashboard
# and three mock agents via docker compose, and runs the CLI against
# each mock to confirm the expected pass/fail shape.
#
# Usage:  ./scripts/e2e.sh
# Exits 0 on success, non-zero if any expectation misses.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${A2A_PORT:-3456}"
CLI="node packages/cli/dist/index.js"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()  { printf '   \033[32m✓\033[0m %s\n' "$*"; }
bad() { printf '   \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" > /dev/null || bad "missing required tool: $1"
}
require docker
require node
require curl
require pnpm

say "build packages"
pnpm -r --filter=./packages/* build > /dev/null
ok "packages built"

say "start web + mock agents (docker compose --profile demo)"
A2A_PORT="$PORT" docker compose --profile demo up -d > /dev/null

# Wait for web dashboard to be ready
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "http://localhost:$PORT/" > /dev/null || bad "web dashboard did not come up on :$PORT"
ok "dashboard responds on :$PORT"

say "probe web SSRF guard"
for target in 'http://169.254.169.254' 'http://localhost:22' 'file:///etc/passwd'; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
    "http://localhost:$PORT/api/check" \
    -H 'Content-Type: application/json' \
    -d "{\"url\":\"$target\"}")
  [ "$code" = "400" ] || bad "SSRF guard failed to reject $target (got HTTP $code)"
done
ok "SSRF guard rejects metadata IP, localhost, and file://"

say "CLI against mock-good (expect schema-level pass, SSRF fail on unresolved host)"
$CLI run http://localhost:8001 --skip-protocol --fail-on never > /tmp/a2a-good.txt
grep -q '✓ \[MUST\] Agent card conforms to A2A schema' /tmp/a2a-good.txt || bad "good mock schema should pass"
ok "good mock passes card-level assertions"

say "CLI against mock-bad (expect HTTPS + SSRF fails)"
$CLI run http://localhost:8002 --skip-protocol --fail-on never > /tmp/a2a-bad.txt
grep -q '✗ \[MUST\] All URLs declared in the agent card use HTTPS' /tmp/a2a-bad.txt \
  || bad "bad mock should fail sec.tls.https"
grep -q '✗ \[MUST\] No agent-card URL resolves to private IP space' /tmp/a2a-bad.txt \
  || bad "bad mock should fail sec.ssrf"
ok "bad mock trips HTTPS + SSRF"

say "CLI against mock-broken (expect schema fail)"
$CLI run http://localhost:8003 --skip-protocol --fail-on never > /tmp/a2a-broken.txt
grep -q '✗ \[MUST\] Agent card conforms to A2A schema' /tmp/a2a-broken.txt \
  || bad "broken mock should fail schema"
ok "broken mock reports schema errors"

say "snapshot round-trip"
$CLI run http://localhost:8001 --skip-protocol --fail-on never \
  --snapshot-out /tmp/a2a-baseline.json > /dev/null
$CLI run http://localhost:8001 --skip-protocol --fail-on never \
  --snapshot /tmp/a2a-baseline.json > /tmp/a2a-diff.txt
grep -q 'no changes since baseline' /tmp/a2a-diff.txt \
  || bad "snapshot diff should be clean on identical run"
ok "snapshot clean against self"

$CLI run http://localhost:8002 --skip-protocol --fail-on never \
  --snapshot /tmp/a2a-baseline.json > /tmp/a2a-regression.txt || true
grep -q 'regression' /tmp/a2a-regression.txt \
  || bad "snapshot diff should flag regression from good → bad"
ok "snapshot flags regression when card changes for the worse"

say "reporters emit non-empty artifacts"
$CLI run http://localhost:8001 --skip-protocol --fail-on never \
  --junit /tmp/a2a-report.junit.xml \
  --badge /tmp/a2a-badge.svg > /dev/null
[ -s /tmp/a2a-report.junit.xml ] || bad "junit XML was not written"
[ -s /tmp/a2a-badge.svg ] || bad "badge SVG was not written"
grep -q '<testsuite' /tmp/a2a-report.junit.xml || bad "junit XML missing <testsuite>"
grep -q '<svg' /tmp/a2a-badge.svg || bad "badge SVG missing <svg>"
ok "junit + badge artifacts well-formed"

say "teardown"
A2A_PORT="$PORT" docker compose --profile demo down > /dev/null
ok "stack stopped"

printf '\n\033[1;32mE2E PASSED\033[0m  (dashboard + mocks + CLI assertions + snapshot + reporters)\n'
