import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { methodsFor } from '../spec.js';
import { jsonRpcChecks } from './json-rpc.js';

const ENDPOINT = 'https://agent.example.com/a2a';
const METHODS = methodsFor('1.0');

function mockResponses(bodies: Array<Record<string, unknown>>): void {
  let i = 0;
  const fetchMock = vi.fn(async () => {
    const body = bodies[i++] ?? {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('jsonRpcChecks', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes when server returns expected error codes', async () => {
    mockResponses([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid Request' } },
      { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } },
      { jsonrpc: '2.0', id: 2, error: { code: -32001, message: 'Task not found' } },
      { jsonrpc: '2.0', id: 3, error: { code: -32001, message: 'Task not found' } },
    ]);

    const results = await jsonRpcChecks(ENDPOINT, METHODS);
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.status === 'pass')).toBe(true);
  });

  it('fails when server returns success instead of error', async () => {
    mockResponses([{ jsonrpc: '2.0', id: 1, result: {} }]);

    const results = await jsonRpcChecks(ENDPOINT, METHODS);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.message).toMatch(/expected error response/);
  });

  it('fails when body is not JSON-RPC 2.0 shape', async () => {
    const fetchMock = vi.fn(async () => new Response('not a json rpc envelope', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await jsonRpcChecks(ENDPOINT, METHODS);
    expect(results[0]?.status).toBe('fail');
  });

  it('fails on wrong error code', async () => {
    mockResponses([{ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal error' } }]);
    const results = await jsonRpcChecks(ENDPOINT, METHODS);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.message).toMatch(/-32700/);
  });
});
