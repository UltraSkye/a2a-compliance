import { promises as dns } from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardSsrfChecks } from './security.js';

const BASE = 'https://agent.example.com';

function mockCardAndDns(card: unknown, addrs: Array<{ address: string; family: number }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(card), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
  vi.spyOn(dns, 'lookup').mockImplementation((async () => addrs) as unknown as typeof dns.lookup);
}

const validCard = {
  name: 'agent',
  url: 'https://agent.example.com/a2a',
  version: '1.0.0',
  capabilities: {},
  skills: [{ id: 'x', name: 'x' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cardSsrfChecks', () => {
  it('passes for a public-resolving HTTPS URL', async () => {
    mockCardAndDns(validCard, [{ address: '93.184.216.34', family: 4 }]);
    const results = await cardSsrfChecks(BASE);
    const ssrf = results.find((r) => r.id === 'sec.ssrf');
    expect(ssrf?.status).toBe('pass');
  });

  it('fails when card URL resolves to RFC 1918 space', async () => {
    mockCardAndDns(validCard, [{ address: '10.0.0.5', family: 4 }]);
    const results = await cardSsrfChecks(BASE);
    const ssrf = results.find((r) => r.id === 'sec.ssrf');
    expect(ssrf?.status).toBe('fail');
    expect(ssrf?.message).toMatch(/10\.0\.0\.5/);
  });

  it('fails on literal link-local IP (cloud metadata)', async () => {
    mockCardAndDns({ ...validCard, url: 'https://169.254.169.254/a2a' }, []);
    const results = await cardSsrfChecks(BASE);
    const ssrf = results.find((r) => r.id === 'sec.ssrf');
    expect(ssrf?.status).toBe('fail');
    expect(ssrf?.message).toMatch(/169\.254\.169\.254/);
  });

  it('fails when card URL uses http://', async () => {
    mockCardAndDns({ ...validCard, url: 'http://agent.example.com/a2a' }, [
      { address: '93.184.216.34', family: 4 },
    ]);
    const results = await cardSsrfChecks(BASE);
    const tls = results.find((r) => r.id === 'sec.tls.https');
    expect(tls?.status).toBe('fail');
  });

  it('fails when hostname is localhost', async () => {
    mockCardAndDns({ ...validCard, url: 'https://localhost/a2a' }, []);
    const results = await cardSsrfChecks(BASE);
    const ssrf = results.find((r) => r.id === 'sec.ssrf');
    expect(ssrf?.status).toBe('fail');
  });

  it('skips when agent card is not reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const results = await cardSsrfChecks(BASE);
    expect(results[0]?.status).toBe('skip');
  });

  it('produces exactly one entry per check id regardless of URL count', async () => {
    const multi = {
      ...validCard,
      url: 'https://agent.example.com/a2a',
      provider: { organization: 'X', url: 'http://provider.example.com' },
      documentationUrl: 'https://docs.example.com',
    };
    mockCardAndDns(multi, [{ address: '93.184.216.34', family: 4 }]);
    const results = await cardSsrfChecks(BASE);
    const ids = results.map((r) => r.id);
    // Exactly one tls.https check that fails (provider.url is http), and one ssrf that passes.
    expect(ids.filter((i) => i === 'sec.tls.https')).toHaveLength(1);
    expect(ids.filter((i) => i === 'sec.ssrf')).toHaveLength(1);
    expect(results.find((r) => r.id === 'sec.tls.https')?.status).toBe('fail');
    expect(results.find((r) => r.id === 'sec.tls.https')?.message).toMatch(
      /provider\.example\.com/,
    );
    expect(results.find((r) => r.id === 'sec.ssrf')?.status).toBe('pass');
  });
});
