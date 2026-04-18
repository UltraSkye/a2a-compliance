import { promises as dns } from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinnedDispatcherFor } from './dns-pin.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pinnedDispatcherFor', () => {
  it('refuses a literal private IPv4', async () => {
    await expect(pinnedDispatcherFor('10.0.0.1')).rejects.toThrow(/private range/);
  });

  it('refuses a literal link-local IPv4 (cloud metadata)', async () => {
    await expect(pinnedDispatcherFor('169.254.169.254')).rejects.toThrow(/private range/);
  });

  it('refuses when every resolution is private', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation((async () => [
      { address: '10.0.0.1', family: 4 },
    ]) as unknown as typeof dns.lookup);
    await expect(pinnedDispatcherFor('internal.example.com')).rejects.toThrow(/private IPv4/);
  });

  it('accepts a public literal IPv4 and returns a dispatcher', async () => {
    const pinned = await pinnedDispatcherFor('93.184.216.34');
    expect(pinned.pinnedIp).toBe('93.184.216.34');
    expect(pinned.family).toBe(4);
    await pinned.dispatcher.close();
  });

  it('accepts a hostname that resolves publicly and pins the first record', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation((async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '93.184.216.35', family: 4 },
    ]) as unknown as typeof dns.lookup);
    const pinned = await pinnedDispatcherFor('example.com');
    expect(pinned.pinnedIp).toBe('93.184.216.34');
    await pinned.dispatcher.close();
  });
});
