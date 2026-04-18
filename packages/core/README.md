# @a2a-compliance/core

> **TypeScript library for probing, validating, and reporting on
> [A2A (Agent2Agent) protocol](https://a2a-protocol.org/) endpoints.**
> Assertion engine, reporters (JSON / JUnit / SARIF / badge / snapshot),
> SSRF guard, DNS-rebinding pin, check catalog. Zero CLI assumptions —
> drop it into your own server, test harness, or agent dashboard.

[![npm](https://img.shields.io/npm/v/%40a2a-compliance%2Fcore.svg)](https://www.npmjs.com/package/@a2a-compliance/core)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/UltraSkye/a2a-compliance/blob/main/LICENSE)

Part of [`a2a-compliance`](https://github.com/UltraSkye/a2a-compliance).
If you just want the command-line tool, use
[`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli)
instead.

## Install

```bash
npm i @a2a-compliance/core
# or
pnpm add @a2a-compliance/core
```

Node 22.10+ required.

## Quick start

```ts
import { runFullChecks } from '@a2a-compliance/core';

const report = await runFullChecks('https://agent.example.com');

console.log(report.summary);
// → { total: 16, pass: 15, fail: 1, warn: 0, skip: 0, tier: 'NON_COMPLIANT' }

for (const check of report.checks) {
  if (check.status === 'fail') {
    console.warn(`${check.id} [${check.category}]: ${check.message}`);
  }
}
```

### Card-only, faster

```ts
import { runCardChecks } from '@a2a-compliance/core';
const report = await runCardChecks('https://agent.example.com');
```

### Reporters

```ts
import { toBadgeSvg, toJUnitXml, toSarif } from '@a2a-compliance/core';
import { writeFileSync } from 'node:fs';

writeFileSync('./report.junit.xml', toJUnitXml(report));
writeFileSync('./badge.svg', toBadgeSvg(report, { tier: true }));
writeFileSync('./report.sarif', toSarif(report)); // SARIF 2.1.0 for GitHub code-scanning
```

### Snapshot regression detection

```ts
import { toSnapshot, diffSnapshot, hasRegressions, parseSnapshot }
  from '@a2a-compliance/core';
import { readFileSync, writeFileSync } from 'node:fs';

// Capture a baseline
writeFileSync('./baseline.json', JSON.stringify(toSnapshot(report)));

// Later: compare
const base = parseSnapshot(JSON.parse(readFileSync('./baseline.json', 'utf8')));
if (base) {
  const diff = diffSnapshot(base, newReport);
  if (hasRegressions(diff)) process.exit(1);
}
```

### SSRF guard for your own service

```ts
import { ssrfCheckForUrl } from '@a2a-compliance/core';

const safety = await ssrfCheckForUrl(userSuppliedUrl);
if (!safety.ok) throw new Error(`refusing to probe: ${safety.reason}`);
```

Rejects loopback, RFC 1918, link-local (incl. `169.254.169.254` cloud
metadata), carrier-grade NAT, and IPv4-mapped / IPv4-compat / NAT64
IPv6 forms of all the above.

### Introspect the check catalog

```ts
import { CHECK_CATALOG, explain, listCheckIds } from '@a2a-compliance/core';

for (const id of listCheckIds()) {
  console.log(id, '→', CHECK_CATALOG[id]?.category);
}

const meta = explain('sec.ssrf');
// { id, category, severity, title, description, specRef? }
```

## CheckResult shape

```ts
type Category = 'card' | 'protocol' | 'methods' | 'security' | 'spec' | 'auth';
type Severity = 'must' | 'should' | 'info';  // maps to RFC 2119
type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
type ComplianceTier =
  | 'NON_COMPLIANT'   // any MUST failed
  | 'MANDATORY'       // all MUSTs pass, some SHOULDs fail/warn
  | 'RECOMMENDED'     // all MUSTs + SHOULDs pass, some were skipped
  | 'FULL_FEATURED';  // every emitted check passed

interface CheckResult {
  id: string;                       // stable dotted id, e.g. 'sec.ssrf'
  title: string;
  category?: Category;
  severity: Severity;
  status: CheckStatus;
  specRef?: { section: string; url: string };
  message?: string;
  evidence?: unknown;
  durationMs: number;
}
```

The full assertion list is in
[`docs/ARCHITECTURE.md`](https://github.com/UltraSkye/a2a-compliance/blob/main/docs/ARCHITECTURE.md)
on the repo — or read it at runtime via `CHECK_CATALOG`.

## Spec version adaptation

`runFullChecks` reads `protocolVersion` from the agent card and swaps
the JSON-RPC method names accordingly (A2A v0.3 `tasks/send` ↔ v1.0
`message/send`, etc.). Unknown versions fall back to v1.0 with a
SHOULD-level warning.

## Capability-gated severity

When the card declares `capabilities.streaming` or
`capabilities.pushNotifications`, the corresponding probes are
promoted from SHOULD to MUST — the "false advertising" rule.

## DNS-rebinding pin

`fetchWithTimeout(url, { pinDns: true })` resolves the hostname once,
refuses private-space targets, and feeds undici a
`connect.lookup` that returns the pinned IP for every subsequent
connect — closes the TOCTOU residual documented in `SECURITY.md`.

## Safety limits

- 10 s timeout per outbound HTTP call
- 2 MB response-body cap (`ResponseTooLargeError` on overrun)
- Redirects followed manually with per-hop SSRF re-check (max 10 hops)

## See also

- 🏠 [Repository + full docs](https://github.com/UltraSkye/a2a-compliance)
- 🤖 [`AGENTS.md`](https://github.com/UltraSkye/a2a-compliance/blob/main/AGENTS.md) — AI-agent quick reference
- 🔌 [`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli) — CLI wrapper
- 🧪 [`@a2a-compliance/schemas`](https://www.npmjs.com/package/@a2a-compliance/schemas) — Zod schemas alone

## License

MIT.
