import { afterEach, describe, expect, it, vi } from 'vitest';
import { methodsFor } from '../spec.js';
import { messageSendCheck, messageStreamContentTypeCheck } from './methods.js';

const ENDPOINT = 'https://agent.example.com/a2a';
const METHODS = methodsFor('1.0');

function mockJson(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

function mockSse(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n', {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('messageSendCheck', () => {
  it('passes when result is a valid Task', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { id: 'task-1', status: { state: 'submitted' } },
    });
    const r = await messageSendCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('pass');
  });

  it('passes when result is a valid Message', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: {
        role: 'agent',
        parts: [{ kind: 'text', text: 'pong' }],
        messageId: 'm-1',
      },
    });
    const r = await messageSendCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('pass');
  });

  it('warns on tolerated JSON-RPC errors (-32602)', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Invalid params' },
    });
    const r = await messageSendCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('warn');
    expect(r.message).toMatch(/-32602|tolerated/);
  });

  it('fails on unexpected error codes', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found' },
    });
    const r = await messageSendCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/unexpected/);
  });

  it('fails when result is neither Task nor Message', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { nonsense: true },
    });
    const r = await messageSendCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/neither/);
  });
});

describe('messageStreamContentTypeCheck', () => {
  it('passes when server responds with text/event-stream', async () => {
    mockSse();
    const r = await messageStreamContentTypeCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('pass');
  });

  it('warns when server returns a JSON-RPC error (streaming not supported)', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32004, message: 'streaming not supported' },
    });
    const r = await messageStreamContentTypeCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('warn');
  });

  it('fails when Content-Type is plain JSON with success body', async () => {
    mockJson(200, { jsonrpc: '2.0', id: 1, result: {} });
    const r = await messageStreamContentTypeCheck(ENDPOINT, METHODS);
    expect(r.status).toBe('fail');
  });
});
