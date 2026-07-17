import { afterEach, describe, expect, it, vi } from 'vitest';
import { profileFor } from '../spec.js';
import {
  listTasksCheck,
  messageSendCheck,
  messageStreamContentTypeCheck,
  methodChecks,
} from './methods.js';

const ENDPOINT = 'https://agent.example.com/a2a';
const PROFILE = profileFor('0.3');

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
    const r = await messageSendCheck(ENDPOINT, PROFILE);
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
    const r = await messageSendCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('pass');
  });

  it('warns on tolerated JSON-RPC errors (-32602)', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Invalid params' },
    });
    const r = await messageSendCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('warn');
    expect(r.message).toMatch(/-32602|tolerated/);
  });

  it('fails on unexpected error codes', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found' },
    });
    const r = await messageSendCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/unexpected/);
  });

  it('fails when result is neither Task nor Message', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { nonsense: true },
    });
    const r = await messageSendCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/neither/);
  });
});

describe('messageSendCheck — 1.0 binding', () => {
  const V1 = profileFor('1.0');

  it('passes on a {task} wrapper with TASK_STATE_* state', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { task: { id: 'task-1', status: { state: 'TASK_STATE_SUBMITTED' } } },
    });
    const r = await messageSendCheck(ENDPOINT, V1);
    expect(r.status).toBe('pass');
  });

  it('passes on a {message} wrapper with proto-JSON message', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { message: { messageId: 'm-1', role: 'ROLE_AGENT', parts: [{ text: 'pong' }] } },
    });
    const r = await messageSendCheck(ENDPOINT, V1);
    expect(r.status).toBe('pass');
  });

  it('fails on a bare 0.3-style Task result', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { id: 'task-1', status: { state: 'submitted' } },
    });
    const r = await messageSendCheck(ENDPOINT, V1);
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/SendMessageResponse/);
  });

  it('sends SendMessage with the A2A-Version header and proto-JSON probe', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      result: { task: { id: 't', status: { state: 'TASK_STATE_COMPLETED' } } },
    });
    await messageSendCheck(ENDPOINT, V1);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers as Record<string, string>).get('A2A-Version')).toBe('1.0');
    const body = JSON.parse(init.body as string) as {
      method: string;
      params: { message: { role: string; parts: Array<Record<string, unknown>> } };
    };
    expect(body.method).toBe('SendMessage');
    expect(body.params.message.role).toBe('ROLE_USER');
    expect(body.params.message.parts[0]).toHaveProperty('text');
    expect(body.params.message.parts[0]).not.toHaveProperty('kind');
  });
});

describe('listTasksCheck', () => {
  const V1 = profileFor('1.0');

  it('is skipped entirely on pre-1.0 bindings', async () => {
    expect(await listTasksCheck(ENDPOINT, PROFILE)).toBeUndefined();
    mockJson(200, { jsonrpc: '2.0', id: 6, error: { code: -32601, message: 'x' } });
    const results = await methodChecks(ENDPOINT, PROFILE);
    expect(results.some((r) => r.id === 'rpc.tasksList.shape')).toBe(false);
  });

  it('passes on a valid ListTasksResponse', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 6,
      result: {
        tasks: [{ id: 't-1', status: { state: 'TASK_STATE_COMPLETED' } }],
        nextPageToken: '',
        pageSize: 50,
        totalSize: 1,
      },
    });
    const r = await listTasksCheck(ENDPOINT, V1);
    expect(r?.status).toBe('pass');
  });

  it('passes on an empty proto3-JSON listing (all default fields omitted)', async () => {
    mockJson(200, { jsonrpc: '2.0', id: 6, result: {} });
    const r = await listTasksCheck(ENDPOINT, V1);
    expect(r?.status).toBe('pass');
  });

  it('warns on tolerated unauthenticated refusal', async () => {
    mockJson(200, { jsonrpc: '2.0', id: 6, error: { code: -32004, message: 'nope' } });
    const r = await listTasksCheck(ENDPOINT, V1);
    expect(r?.status).toBe('warn');
  });

  it('fails on unexpected error codes and on 0.3-style task states', async () => {
    mockJson(200, { jsonrpc: '2.0', id: 6, error: { code: -32601, message: 'unknown' } });
    expect((await listTasksCheck(ENDPOINT, V1))?.status).toBe('fail');

    mockJson(200, {
      jsonrpc: '2.0',
      id: 6,
      result: { tasks: [{ id: 't-1', status: { state: 'completed' } }] },
    });
    const r = await listTasksCheck(ENDPOINT, V1);
    expect(r?.status).toBe('fail');
    expect(r?.message).toMatch(/ListTasksResponse/);
  });

  it('sends ListTasks with empty params and the A2A-Version header', async () => {
    mockJson(200, { jsonrpc: '2.0', id: 6, result: {} });
    await listTasksCheck(ENDPOINT, V1);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers as Record<string, string>).get('A2A-Version')).toBe('1.0');
    const body = JSON.parse(init.body as string) as { method: string; params: unknown };
    expect(body.method).toBe('ListTasks');
    expect(body.params).toEqual({});
  });
});

describe('messageStreamContentTypeCheck', () => {
  it('passes when server responds with text/event-stream', async () => {
    mockSse();
    const r = await messageStreamContentTypeCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('pass');
  });

  it('warns when server returns a JSON-RPC error (streaming not supported)', async () => {
    mockJson(200, {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32004, message: 'streaming not supported' },
    });
    const r = await messageStreamContentTypeCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('warn');
  });

  it('fails when Content-Type is plain JSON with success body', async () => {
    mockJson(200, { jsonrpc: '2.0', id: 1, result: {} });
    const r = await messageStreamContentTypeCheck(ENDPOINT, PROFILE);
    expect(r.status).toBe('fail');
  });
});
