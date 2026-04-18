# @a2a-compliance/schemas

> **Zod schemas for the [A2A (Agent2Agent) protocol](https://a2a-protocol.org/).**
> Parse and validate Agent Cards, JSON-RPC envelopes, Tasks, and
> Messages without depending on a full runtime. Zero runtime deps
> beyond Zod; runs in Node, Bun, Deno, the browser, and edge runtimes.

[![npm](https://img.shields.io/npm/v/%40a2a-compliance%2Fschemas.svg)](https://www.npmjs.com/package/@a2a-compliance/schemas)
[![license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/UltraSkye/a2a-compliance/blob/main/LICENSE)

Part of [`a2a-compliance`](https://github.com/UltraSkye/a2a-compliance).
If you want the assertion engine + reporters, use
[`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core).
For a CLI, use
[`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli).

## Install

```bash
npm i @a2a-compliance/schemas
# or
pnpm add @a2a-compliance/schemas
```

## What's in the box

| Export | Description |
|---|---|
| `AgentCardSchema` | Zod schema for `/.well-known/agent-card.json` |
| `AgentCard` | TypeScript type inferred from the schema |
| `AgentSkillSchema`, `AgentProviderSchema`, `AgentAuthenticationSchema`, `AgentCapabilitiesSchema` | Sub-schemas |
| `AGENT_CARD_WELL_KNOWN_PATH` | `'/.well-known/agent-card.json'` |
| `JsonRpcRequestSchema`, `JsonRpcResponseSchema` | JSON-RPC 2.0 envelopes |
| `JsonRpcErrorCode`, `A2AErrorCode` | Numeric constants for the error taxonomy |
| `MessageSchema`, `PartSchema` | A2A Message + discriminated Part union (text / file / data) |
| `TaskSchema`, `TaskStateSchema` | A2A Task and its state enum |
| `makeProbeMessage(text)` | UUID-keyed valid Message for smoke testing |
| `isErrorResponse(r)` | Type-guard narrowing a response to the error variant |

## Usage

```ts
import { AgentCardSchema } from '@a2a-compliance/schemas';

const res = await fetch('https://agent.example.com/.well-known/agent-card.json');
const parsed = AgentCardSchema.safeParse(await res.json());
if (!parsed.success) {
  console.error(parsed.error.issues);
  return;
}
console.log(parsed.data.name, '→', parsed.data.skills.length, 'skills');
```

Validate a JSON-RPC response:

```ts
import { JsonRpcResponseSchema, isErrorResponse } from '@a2a-compliance/schemas';

const parsed = JsonRpcResponseSchema.safeParse(await res.json());
if (parsed.success && isErrorResponse(parsed.data)) {
  console.error('RPC error', parsed.data.error.code, parsed.data.error.message);
}
```

## Design notes

- **HTTPS-only URL fields.** `card.url`, `provider.url`,
  `documentationUrl` reject non-http(s) schemes at the schema layer —
  no `javascript:`, `data:`, `file:`, `mailto:`, `gopher:`. Prevents a
  malicious card from feeding those URIs into downstream clients that
  blindly trust parsed input.
- **Strict parts.** `Part` is a discriminated union on `kind` (v1.0):
  `text` / `file` / `data`. Mistyped parts fail parse.
- **Forward-compatible.** Unknown top-level fields are tolerated so
  cards from future minor versions still parse; missing required
  fields fail as expected.

## Spec version

Targets A2A protocol spec **v0.3** and **v1.0**.

## See also

- 🏠 [Repository + full docs](https://github.com/UltraSkye/a2a-compliance)
- 🤖 [`AGENTS.md`](https://github.com/UltraSkye/a2a-compliance/blob/main/AGENTS.md) — AI-agent quick reference
- 🧱 [`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core) — assertion engine that uses these schemas
- 🔌 [`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli) — command-line tool

## License

MIT.
