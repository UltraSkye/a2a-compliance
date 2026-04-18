# a2a-reference-agent

A minimal, spec-compliant A2A agent used to dogfood `a2a-compliance` and
to serve as an end-to-end fixture in CI. Zero runtime dependencies — pure
Node built-ins — so it starts in under a second and adds no install step
to the build pipeline.

## Run

```bash
node examples/reference-agent/server.js
# → card:     http://localhost:8080/.well-known/agent-card.json
# → endpoint: http://localhost:8080/a2a
```

Docker:

```bash
docker build -t a2a-reference-agent examples/reference-agent
docker run --rm -p 8080:8080 a2a-reference-agent
```

## What it implements

| Method                              | Behaviour                                         |
|-------------------------------------|---------------------------------------------------|
| `GET /.well-known/agent-card.json`  | v1.0 agent card                                   |
| `message/send`                      | Echoes the text part back as an agent Message     |
| `message/stream`                    | SSE stream with a single echo event               |
| `tasks/get`                         | `-32001 TaskNotFound` for any id (stateless)      |
| `tasks/cancel`, `tasks/resubscribe` | `-32001 TaskNotFound`                             |
| `tasks/pushNotificationConfig/set`  | Echoes config (no-op, for probe compatibility)    |
| `tasks/pushNotificationConfig/get`  | `-32001 TaskNotFound`                             |
| Batch JSON-RPC                      | Array of responses per spec; `message/stream` is rejected inside batch |
| Unknown method                      | `-32601 Method not found`                         |
| Malformed JSON                      | `-32700 Parse error`                              |
| Invalid envelope                    | `-32600 Invalid Request`                          |

This is teaching material — it does no authentication, no persistence,
and trusts whatever the client sends. Do not run it in production.

## Verify against itself

```bash
# In one shell:
node examples/reference-agent/server.js

# In another:
npx @a2a-compliance/cli run http://localhost:8080
```

Everything should pass; this server exists precisely so that
`a2a-compliance` has a known-compliant target to test against.
