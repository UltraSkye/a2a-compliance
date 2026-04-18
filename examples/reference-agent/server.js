// Reference A2A agent — a minimal, spec-compliant implementation used to
// dogfood `a2a-compliance`. Zero dependencies beyond Node built-ins, so it
// can run in CI without a preceding install step.
//
// Serves:
//   GET  /.well-known/agent-card.json  → v1.0 agent card
//   POST /a2a                          → JSON-RPC 2.0
//     message/send         — returns a Message result
//     message/stream       — returns text/event-stream
//     tasks/get            — TaskNotFoundError for unknown ids
//     tasks/cancel         — TaskNotFoundError
//     tasks/resubscribe    — TaskNotFoundError
//     tasks/pushNotificationConfig/set — accepted (no-op echo)
//     tasks/pushNotificationConfig/get — TaskNotFoundError
//
// Error behaviour mirrors the spec:
//   -32700 Parse error, -32600 Invalid Request, -32601 Method not found.
//
// This server is teaching material — NOT production. It does no auth,
// no persistence, and trusts whatever the client sends.

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? '8080');
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_BASE = process.env.PUBLIC_BASE ?? `http://localhost:${PORT}`;

const AGENT_CARD = {
  name: 'a2a-reference-agent',
  description: 'Reference implementation used by a2a-compliance for e2e tests.',
  url: `${PUBLIC_BASE}/a2a`,
  version: '0.1.0',
  protocolVersion: '1.0',
  capabilities: { streaming: true, pushNotifications: false },
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [
    {
      id: 'echo',
      name: 'Echo',
      description: 'Returns the text you send.',
      tags: ['utility'],
    },
  ],
};

const A2A_ERR = {
  TaskNotFound: -32001,
  TaskNotCancelable: -32002,
  PushNotificationNotSupported: -32003,
  UnsupportedOperation: -32004,
  ContentTypeNotSupported: -32005,
  InvalidAgentResponse: -32006,
};
const JSONRPC_ERR = {
  Parse: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
};

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handleSingle(req, res, msg) {
  if (typeof msg !== 'object' || msg === null || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    writeJson(res, 200, jsonRpcError(msg?.id ?? null, JSONRPC_ERR.InvalidRequest, 'Invalid Request'));
    return true;
  }

  switch (msg.method) {
    case 'message/send': {
      const text =
        msg.params?.message?.parts?.find?.((p) => p?.kind === 'text' || p?.type === 'text')?.text ??
        '';
      const reply = {
        role: 'agent',
        parts: [{ kind: 'text', text: `echo: ${text}` }],
        messageId: globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}`,
      };
      writeJson(res, 200, jsonRpcResult(msg.id, reply));
      return true;
    }
    case 'message/stream': {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const payload = jsonRpcResult(msg.id, {
        role: 'agent',
        parts: [{ kind: 'text', text: 'ok' }],
        messageId: globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}`,
      });
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.end();
      return true;
    }
    case 'tasks/get':
    case 'tasks/cancel':
    case 'tasks/resubscribe':
    case 'tasks/pushNotificationConfig/get': {
      writeJson(res, 200, jsonRpcError(msg.id, A2A_ERR.TaskNotFound, `task not found`));
      return true;
    }
    case 'tasks/pushNotificationConfig/set': {
      writeJson(res, 200, jsonRpcResult(msg.id, {
        taskId: msg.params?.id ?? 'unknown',
        config: msg.params?.pushNotificationConfig ?? {},
      }));
      return true;
    }
    default: {
      writeJson(res, 200, jsonRpcError(msg.id, JSONRPC_ERR.MethodNotFound, `method not found: ${msg.method}`));
      return true;
    }
  }
}

function handleA2A(req, res, parsed) {
  // Batch — per JSON-RPC 2.0 we answer with an array of responses.
  if (Array.isArray(parsed)) {
    const results = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null || item.jsonrpc !== '2.0' || typeof item.method !== 'string') {
        results.push(jsonRpcError(item?.id ?? null, JSONRPC_ERR.InvalidRequest, 'Invalid Request'));
        continue;
      }
      // We can't reuse handleSingle (it writes the response); inline a
      // synchronous answer for each batch item. Streaming methods aren't
      // sensible inside a batch, so reject them there.
      if (item.method === 'message/stream') {
        results.push(jsonRpcError(item.id, JSONRPC_ERR.InvalidRequest, 'stream not allowed in batch'));
        continue;
      }
      const text =
        item.params?.message?.parts?.find?.((p) => p?.kind === 'text' || p?.type === 'text')?.text ??
        '';
      if (item.method === 'message/send') {
        results.push(
          jsonRpcResult(item.id, {
            role: 'agent',
            parts: [{ kind: 'text', text: `echo: ${text}` }],
            messageId: globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}`,
          }),
        );
      } else if (item.method === 'tasks/get' || item.method === 'tasks/cancel' || item.method === 'tasks/resubscribe') {
        results.push(jsonRpcError(item.id, A2A_ERR.TaskNotFound, 'task not found'));
      } else {
        results.push(jsonRpcError(item.id, JSONRPC_ERR.MethodNotFound, `method not found: ${item.method}`));
      }
    }
    writeJson(res, 200, results);
    return;
  }

  handleSingle(req, res, parsed);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
      writeJson(res, 200, AGENT_CARD);
      return;
    }

    if (req.method === 'POST' && req.url === '/a2a') {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        writeJson(res, 200, jsonRpcError(null, JSONRPC_ERR.Parse, 'Parse error'));
        return;
      }
      handleA2A(req, res, parsed);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    // Stack traces and raw Error messages can leak internal paths,
    // module versions, or upstream endpoint details. Log server-side
    // for the operator; send a generic message to the client.
    console.error('reference-agent internal error:', err);
    writeJson(res, 200, jsonRpcError(null, JSONRPC_ERR.InternalError, 'internal error'));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`a2a-reference-agent listening on ${HOST}:${PORT}`);
  console.log(`  card:     ${PUBLIC_BASE}/.well-known/agent-card.json`);
  console.log(`  endpoint: ${PUBLIC_BASE}/a2a`);
});
