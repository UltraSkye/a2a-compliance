import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushNotificationChecks } from './push-notifications.js';

const BASE = 'https://agent.example.com';
const ENDPOINT = `${BASE}/a2a`;

const V1_METHODS = {
  send: 'message/send',
  stream: 'message/stream',
  get: 'tasks/get',
  cancel: 'tasks/cancel',
  resubscribe: 'tasks/resubscribe',
  pushSet: 'tasks/pushNotificationConfig/set',
  pushGet: 'tasks/pushNotificationConfig/get',
};

const cardWithPush = {
  name: 't',
  url: ENDPOINT,
  version: '1',
  capabilities: { streaming: true, pushNotifications: true },
  skills: [{ id: 'a', name: 'a' }],
};

const cardWithoutPush = {
  name: 't',
  url: ENDPOINT,
  version: '1',
  capabilities: { streaming: true, pushNotifications: false },
  skills: [{ id: 'a', name: 'a' }],
};

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pushNotificationChecks', () => {
  it('emits a single skip marker when the capability is not declared', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(cardWithoutPush)),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('rpc.pushNotifications.capability');
    expect(results[0]?.status).toBe('skip');
  });

  it('skips when card can not be parsed at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson({ garbage: true })),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results[0]?.status).toBe('skip');
  });

  it('skips when card fetch fails outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results[0]?.status).toBe('skip');
  });

  it('passes when capability declared and both methods return accepted error codes', async () => {
    const queue = [
      okJson(cardWithPush), // capability probe
      okJson({ jsonrpc: '2.0', id: 10, error: { code: -32001, message: 'task not found' } }),
      okJson({ jsonrpc: '2.0', id: 10, error: { code: -32001, message: 'task not found' } }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.status).toBe('pass');
    expect(results.find((r) => r.id === 'rpc.pushNotifications.get')?.status).toBe('pass');
  });

  it('fails when server returns an unexpected error code', async () => {
    const queue = [
      okJson(cardWithPush),
      okJson({ jsonrpc: '2.0', id: 10, error: { code: -32603, message: 'internal' } }),
      okJson({ jsonrpc: '2.0', id: 10, error: { code: -32603, message: 'internal' } }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.status).toBe('fail');
  });

  it('passes when server returns a success result instead of an error', async () => {
    const queue = [
      okJson(cardWithPush),
      okJson({ jsonrpc: '2.0', id: 10, result: {} }),
      okJson({ jsonrpc: '2.0', id: 10, result: {} }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    // A success result means the server accepted the probe — treat as pass.
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.status).toBe('pass');
  });

  it('fails when server returns non-JSON-RPC body', async () => {
    const queue = [
      okJson(cardWithPush),
      new Response('not json at all', { status: 200 }),
      new Response('not json at all', { status: 200 }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.status).toBe('fail');
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.message).toMatch(/not JSON/);
  });

  it('fails when probe itself throws (network error)', async () => {
    const queue: Response[] = [okJson(cardWithPush)];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const q = queue[i++];
        if (q) return q;
        throw new Error('fetch failed');
      }),
    );
    const results = await pushNotificationChecks(BASE, ENDPOINT, V1_METHODS);
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.status).toBe('fail');
    expect(results.find((r) => r.id === 'rpc.pushNotifications.set')?.message).toBe('fetch failed');
  });
});
