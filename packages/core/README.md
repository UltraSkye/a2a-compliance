# @a2a-compliance/core

Programmatic compliance engine for [A2A (Agent2Agent) protocol][a2a]
endpoints. Drop it into your own server, test harness, or CI wrapper
when the [`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli)
doesn't fit.

[a2a]: https://a2a-protocol.org/

```bash
npm i @a2a-compliance/core
```

## Quick start

```ts
import { runFullChecks } from '@a2a-compliance/core';

const report = await runFullChecks('https://agent.example.com');

console.log(report.summary);
// → { total: 15, pass: 11, fail: 2, warn: 1, skip: 1 }

for (const check of report.checks) {
  if (check.status === 'fail') {
    console.warn(`${check.id}: ${check.message}`);
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
import { toBadgeSvg, toJUnitXml } from '@a2a-compliance/core';
import { writeFileSync } from 'node:fs';

writeFileSync('./report.junit.xml', toJUnitXml(report));
writeFileSync('./badge.svg', toBadgeSvg(report));
```

### Snapshot regression detection

```ts
import { toSnapshot, diffSnapshot, hasRegressions, parseSnapshot } from '@a2a-compliance/core';
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

The guard rejects loopback, RFC 1918, link-local (incl. 169.254.169.254
cloud metadata), carrier-NAT, and IPv4-mapped / IPv4-compat / NAT64 IPv6
forms of all the above.

## Check taxonomy

Every check returns:

```ts
interface CheckResult {
  id: string;                        // stable dotted id, e.g. 'sec.ssrf'
  title: string;
  severity: 'must' | 'should' | 'info';
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message?: string;
  evidence?: unknown;
  durationMs: number;
}
```

The full assertion list is in [`docs/ARCHITECTURE.md`][arch] on the repo.

[arch]: https://github.com/UltraSkye/a2a-compliance/blob/main/docs/ARCHITECTURE.md

## Spec version adaptation

`runFullChecks` reads `protocolVersion` from the agent card and swaps the
JSON-RPC method names accordingly (A2A v0.3 `tasks/send` ↔ v1.0
`message/send`, etc.). Unknown versions fall back to v1.0 with a warning.

## Safety limits

- 10 s per outbound HTTP call (configurable via internal constants)
- 2 MB response body cap (`ResponseTooLargeError` on overrun)
- Timeouts are per-request, not per-run — no cumulative budget yet

## License

MIT.
