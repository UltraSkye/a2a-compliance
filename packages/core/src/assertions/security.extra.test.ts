import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardSsrfChecks } from './security.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cardSsrfChecks misc paths', () => {
  it('skips with fetch-error reason when the network throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ENETUNREACH');
      }),
    );
    const results = await cardSsrfChecks('https://agent.example.com');
    expect(results[0]?.id).toBe('sec.card.fetch');
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.message).toBe('ENETUNREACH');
  });

  it('skips when body is not a valid card (no URLs to probe)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ not: 'a card' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const results = await cardSsrfChecks('https://agent.example.com');
    expect(results[0]?.id).toBe('sec.card.fetch');
    expect(results[0]?.status).toBe('skip');
  });

  it('flags ACAO:* + ACAC:true as CORS misconfiguration', async () => {
    const card = {
      name: 't',
      url: 'https://example.com/a2a',
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
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true',
            },
          }),
      ),
    );
    const results = await cardSsrfChecks('https://agent.example.com');
    const cors = results.find((r) => r.id === 'sec.cors.wildcardWithCreds');
    expect(cors?.status).toBe('fail');
  });
});
