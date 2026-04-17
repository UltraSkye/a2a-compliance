import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentCardChecks } from './agent-card.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BASE = 'https://agent.example.com';

describe('agentCardChecks error paths', () => {
  it('network error yields card.reachable=fail with the error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );
    const results = await agentCardChecks(BASE);
    const reachable = results.find((r) => r.id === 'card.reachable');
    expect(reachable?.status).toBe('fail');
    expect(reachable?.message).toBe('ECONNRESET');
    // Downstream checks must be short-circuited.
    expect(results.find((r) => r.id === 'card.schema')).toBeUndefined();
  });

  it('HTTP 500 yields card.reachable=fail and no downstream checks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('broken', { status: 500 })),
    );
    const results = await agentCardChecks(BASE);
    expect(results.find((r) => r.id === 'card.reachable')?.status).toBe('fail');
    expect(results).toHaveLength(1);
  });

  it('invalid JSON body yields card.json=fail (redacted message)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json at all', { status: 200 })),
    );
    const results = await agentCardChecks(BASE);
    const json = results.find((r) => r.id === 'card.json');
    expect(json?.status).toBe('fail');
    // card.schema shouldn't appear — we bailed on JSON parse.
    expect(results.find((r) => r.id === 'card.schema')).toBeUndefined();
  });

  it('schema mismatch surfaces zod issues without leaking card content', async () => {
    const bad = { name: 't', skills: [], url: 'not-a-url', version: 1 };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(bad), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const results = await agentCardChecks(BASE);
    const schema = results.find((r) => r.id === 'card.schema');
    expect(schema?.status).toBe('fail');
    expect(schema?.message).toBeDefined();
    // Downstream URL+skills checks only run when schema parsed OK.
    expect(results.find((r) => r.id === 'card.urlAbsolute')).toBeUndefined();
    expect(results.find((r) => r.id === 'card.skillsNonEmpty')).toBeUndefined();
  });

  it('warns when Content-Type is wrong but body parses', async () => {
    const card = {
      name: 't',
      url: 'https://example.com/',
      version: '1',
      capabilities: {},
      skills: [{ id: 'a', name: 'a' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(card), {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }),
      ),
    );
    const results = await agentCardChecks(BASE);
    const ct = results.find((r) => r.id === 'card.contentType');
    expect(ct?.status).toBe('warn');
    expect(ct?.message).toMatch(/text\/plain/);
  });
});
