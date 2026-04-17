import { afterEach, describe, expect, it, vi } from 'vitest';
import { ssrfCheckForUrl } from './private-network.js';

// The IP-classifier bits (isPrivateIPv4, isPrivateIPv6, normalizeV6ToV4) are
// exercised thoroughly in assertions/security.private-ip.test.ts; this file
// lives to cover the URL-level wrapper's direct behaviour — parsing, bracket
// handling, and DNS fall-through — without going through the assertion
// engine.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ssrfCheckForUrl', () => {
  it('rejects non-URL inputs with a clear reason', async () => {
    const r = await ssrfCheckForUrl('not a url at all');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not a valid URL/);
  });

  it('rejects literal private IPv4', async () => {
    const r = await ssrfCheckForUrl('http://10.0.0.5');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/10\.0\.0\.5/);
  });

  it('rejects literal IPv6 written with brackets', async () => {
    const r = await ssrfCheckForUrl('http://[::1]/');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/::1/);
  });

  it('rejects literal IPv4-mapped IPv6 written with brackets', async () => {
    const r = await ssrfCheckForUrl('http://[::ffff:127.0.0.1]/');
    expect(r.ok).toBe(false);
  });

  it('rejects hostnames containing "localhost"', async () => {
    const r = await ssrfCheckForUrl('http://localhost:8080');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/localhost/);
  });

  it('rejects *.localhost', async () => {
    const r = await ssrfCheckForUrl('http://foo.localhost/');
    expect(r.ok).toBe(false);
  });

  it('accepts a public-resolving hostname', async () => {
    const r = await ssrfCheckForUrl('https://example.com');
    expect(r.ok).toBe(true);
  });

  it('accepts a public literal IPv4', async () => {
    const r = await ssrfCheckForUrl('http://93.184.216.34');
    expect(r.ok).toBe(true);
  });

  it('accepts a public literal IPv6', async () => {
    const r = await ssrfCheckForUrl('https://[2606:4700:4700::1111]/');
    expect(r.ok).toBe(true);
  });
});
