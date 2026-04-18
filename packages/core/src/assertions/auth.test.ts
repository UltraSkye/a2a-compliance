import { afterEach, describe, expect, it, vi } from 'vitest';
import { methodsFor } from '../spec.js';
import { authProbeChecks } from './auth.js';

const BASE = 'https://agent.example.com';
const ENDPOINT = `${BASE}/a2a`;

const cardWithBearer = {
  name: 'agent',
  url: ENDPOINT,
  version: '1.0.0',
  capabilities: {},
  skills: [{ id: 'a', name: 'a' }],
  authentication: { schemes: ['bearer'] },
};

const cardWithOauth = {
  ...cardWithBearer,
  authentication: { schemes: ['oauth2'] },
};

const cardWithNone = {
  name: 'agent',
  url: ENDPOINT,
  version: '1.0.0',
  capabilities: {},
  skills: [{ id: 'a', name: 'a' }],
  authentication: { schemes: ['none'] },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function okJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('authProbeChecks', () => {
  it('skips entirely when the card has no gated scheme', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(cardWithNone)),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results).toHaveLength(0);
  });

  it('passes on HTTP 401 with WWW-Authenticate', async () => {
    const queue = [
      okJson(cardWithBearer),
      new Response('', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="a2a"' },
      }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results.find((r) => r.id === 'auth.anonChallenge')?.status).toBe('pass');
    expect(results.find((r) => r.id === 'auth.anonChallenge')?.message).toMatch(/Bearer/);
  });

  it('warns when 401 is returned without WWW-Authenticate', async () => {
    const queue = [okJson(cardWithBearer), new Response('', { status: 401 })];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results[0]?.status).toBe('warn');
  });

  it('passes on typed JSON-RPC error from A2A error-code space', async () => {
    const queue = [
      okJson(cardWithBearer),
      okJson({ jsonrpc: '2.0', id: 1, error: { code: -32003, message: 'auth required' } }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results[0]?.status).toBe('pass');
  });

  it('fails when the anon request returns 200 with a success result', async () => {
    const queue = [
      okJson(cardWithBearer),
      okJson({ jsonrpc: '2.0', id: 1, result: { kind: 'message' } }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results[0]?.status).toBe('fail');
  });

  it('passes on HTTP 403', async () => {
    const queue = [okJson(cardWithBearer), new Response('', { status: 403 })];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.message).toMatch(/403/);
  });

  it('fails on 200 with non-JSON body', async () => {
    const queue = [okJson(cardWithBearer), new Response('<html>', { status: 200 })];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.message).toMatch(/not JSON/);
  });

  it('fails on network error', async () => {
    const queue: Response[] = [okJson(cardWithBearer)];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const r = queue[i++];
        if (r) return r;
        throw new Error('refused');
      }),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results[0]?.status).toBe('fail');
  });

  it('skips entirely when card fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results).toHaveLength(0);
  });

  it('oauth discovery warns when no .well-known is reachable', async () => {
    const queue = [
      okJson(cardWithOauth),
      okJson({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'auth' } }),
      new Response('', { status: 404 }),
      new Response('', { status: 404 }),
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? new Response('', { status: 404 })),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results.find((r) => r.id === 'auth.discovery')?.status).toBe('warn');
  });

  it('runs OAuth discovery check when oauth2 is declared', async () => {
    const queue = [
      okJson(cardWithOauth), // card
      okJson({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'auth' } }), // anon probe
      okJson({ issuer: 'https://agent.example.com' }), // oidc discovery
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => queue[i++] ?? okJson({})),
    );
    const results = await authProbeChecks(BASE, methodsFor('1.0'));
    expect(results.map((r) => r.id)).toContain('auth.discovery');
    expect(results.find((r) => r.id === 'auth.discovery')?.status).toBe('pass');
  });
});
