import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarize } from './report.js';
import { runCardChecks, runFullChecks } from './runner.js';

describe('summarize', () => {
  it('counts check results by status', () => {
    const out = summarize([
      { id: 'a', title: 'a', severity: 'must', status: 'pass', durationMs: 0 },
      { id: 'b', title: 'b', severity: 'must', status: 'fail', durationMs: 0 },
      { id: 'c', title: 'c', severity: 'should', status: 'warn', durationMs: 0 },
      { id: 'd', title: 'd', severity: 'info', status: 'skip', durationMs: 0 },
      { id: 'e', title: 'e', severity: 'must', status: 'pass', durationMs: 0 },
    ]);
    expect(out).toEqual({ total: 5, pass: 2, fail: 1, warn: 1, skip: 1 });
  });
});

// End-to-end runner tests — minimal mock server exercised through the
// real probe chain (no internal stubs). Each scenario sets up a fetch
// mock that answers the specific endpoints the runner will hit.

function okJson(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const validCard = {
  name: 'test',
  url: 'https://agent.example.com/a2a',
  version: '1.0.0',
  protocolVersion: '1.0',
  capabilities: { streaming: true, pushNotifications: false },
  skills: [{ id: 'echo', name: 'Echo' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runCardChecks', () => {
  it('produces a full report for a reachable, schema-valid card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(validCard)),
    );
    const report = await runCardChecks('https://agent.example.com');

    expect(report.target).toMatch(/^https:\/\/agent\.example\.com\/?$/);
    expect(report.specVersion).toBe('1.0');
    expect(report.checks.find((c) => c.id === 'card.reachable')?.status).toBe('pass');
    expect(report.checks.find((c) => c.id === 'card.schema')?.status).toBe('pass');
    expect(report.summary.total).toBe(report.checks.length);
  });

  it('reports card.reachable=fail when the endpoint returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const report = await runCardChecks('https://agent.example.com');
    expect(report.checks[0]?.id).toBe('card.reachable');
    expect(report.checks[0]?.status).toBe('fail');
  });

  it('redacts credentials out of report.target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(validCard)),
    );
    const report = await runCardChecks('https://alice:hunter2@agent.example.com?token=abc');
    expect(report.target).not.toContain('hunter2');
    expect(report.target).not.toContain('token=abc');
    expect(report.target).toContain('agent.example.com');
  });
});

describe('runFullChecks', () => {
  it('includes the card.protocolVersion check when the card declares a known version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/.well-known/agent-card.json')) return okJson(validCard);
        // JSON-RPC probe endpoint returns a well-formed JSON-RPC error
        return okJson({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'nope' } });
      }),
    );
    const report = await runFullChecks('https://agent.example.com', { skipSecurity: true });
    const versionCheck = report.checks.find((c) => c.id === 'card.protocolVersion');
    expect(versionCheck?.status).toBe('pass');
    expect(versionCheck?.title).toMatch(/v1\.0/);
  });

  it('warns on card.protocolVersion when missing', async () => {
    const noVersion = { ...validCard };
    delete (noVersion as { protocolVersion?: string }).protocolVersion;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(noVersion)),
    );
    const report = await runFullChecks('https://agent.example.com', {
      skipProtocol: true,
      skipSecurity: true,
    });
    const versionCheck = report.checks.find((c) => c.id === 'card.protocolVersion');
    expect(versionCheck?.status).toBe('warn');
    expect(versionCheck?.message).toMatch(/missing/);
  });

  it('warns when protocolVersion is declared but unknown', async () => {
    const weird = { ...validCard, protocolVersion: '99.99' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(weird)),
    );
    const report = await runFullChecks('https://agent.example.com', {
      skipProtocol: true,
      skipSecurity: true,
    });
    const versionCheck = report.checks.find((c) => c.id === 'card.protocolVersion');
    expect(versionCheck?.status).toBe('warn');
    expect(versionCheck?.message).toMatch(/99\.99/);
  });

  it('skipProtocol omits live JSON-RPC probes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(validCard)),
    );
    const report = await runFullChecks('https://agent.example.com', {
      skipProtocol: true,
      skipSecurity: true,
    });
    expect(report.checks.some((c) => c.id.startsWith('rpc.'))).toBe(false);
  });

  it('skipSecurity omits SSRF / TLS / CORS checks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okJson(validCard)),
    );
    const report = await runFullChecks('https://agent.example.com', { skipSecurity: true });
    expect(report.checks.some((c) => c.id.startsWith('sec.'))).toBe(false);
  });

  it('omits card.protocolVersion when discovery failed (card unreachable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const report = await runFullChecks('https://agent.example.com', { skipSecurity: true });
    // card.reachable fails, no protocolVersion noise added on top
    expect(report.checks.find((c) => c.id === 'card.protocolVersion')).toBeUndefined();
  });

  it('selects v0.3 method names when the card declares protocolVersion: "0.3"', async () => {
    const v03 = { ...validCard, protocolVersion: '0.3' };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/.well-known/agent-card.json')) return okJson(v03);
        if (init?.body) {
          try {
            const body = JSON.parse(init.body as string) as { method?: string };
            if (body.method) calls.push(body.method);
          } catch {}
        }
        return okJson({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'x' } });
      }),
    );
    await runFullChecks('https://agent.example.com', { skipSecurity: true });
    // v0.3 calls tasks/send and tasks/sendSubscribe; v1.0 calls message/send and message/stream.
    expect(calls).toContain('tasks/send');
    expect(calls).toContain('tasks/sendSubscribe');
    expect(calls).not.toContain('message/send');
  });
});
