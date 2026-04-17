# @a2a-compliance/schemas

Zod schemas for the [A2A (Agent2Agent) protocol][a2a]. Lets you parse and
validate Agent Cards, JSON-RPC envelopes, Tasks, and Messages without
depending on a full runtime.

[a2a]: https://a2a-protocol.org/

```bash
npm i @a2a-compliance/schemas
```

## What's in the box

| Export | Description |
|--------|-------------|
| `AgentCardSchema` | Zod schema for `/.well-known/agent-card.json` |
| `AgentCard` | TypeScript type inferred from the schema |
| `AGENT_CARD_WELL_KNOWN_PATH` | `'/.well-known/agent-card.json'` |
| `JsonRpcRequestSchema` / `JsonRpcResponseSchema` | JSON-RPC 2.0 envelopes |
| `JsonRpcErrorCode`, `A2AErrorCode` | Numeric constants for error taxonomy |
| `MessageSchema`, `PartSchema` | A2A Message + Part (text/file/data) union |
| `TaskSchema`, `TaskStateSchema` | A2A Task and its state enum |
| `makeProbeMessage(text)` | UUID-keyed valid Message for smoke testing |
| `isErrorResponse(r)` | Type guard — narrows a response to the error variant |

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

Schemas are defined with [Zod 4](https://zod.dev/) and have zero runtime
dependencies other than Zod. They run equally well in Node, Bun, Deno, the
browser, and edge runtimes — no Node built-ins touched.

## Spec version

Targets A2A protocol spec **v0.3 and v1.0**. Unknown fields are tolerated
so cards from future minor versions still parse; missing required fields
fail as expected.

## Related

- [`@a2a-compliance/core`](https://www.npmjs.com/package/@a2a-compliance/core) — assertion engine that uses these schemas
- [`@a2a-compliance/cli`](https://www.npmjs.com/package/@a2a-compliance/cli) — command-line tool

## License

MIT.
