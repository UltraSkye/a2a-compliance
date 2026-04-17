import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, ResponseTooLargeError, readCappedText } from './http.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readCappedText', () => {
  it('returns the full body when under cap', async () => {
    const body = 'hello world';
    const res = new Response(body);
    expect(await readCappedText(res, 1024)).toBe(body);
  });

  it('throws ResponseTooLargeError when Content-Length declares too much', async () => {
    const res = new Response('x'.repeat(10), {
      headers: { 'Content-Length': '9999999' },
    });
    await expect(readCappedText(res, 100)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('throws ResponseTooLargeError when streamed body exceeds cap', async () => {
    const big = 'a'.repeat(5_000);
    const res = new Response(big); // no Content-Length header in mock
    await expect(readCappedText(res, 1_000)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it('accepts bodies exactly at the cap boundary', async () => {
    const body = 'x'.repeat(256);
    const res = new Response(body);
    expect(await readCappedText(res, 256)).toBe(body);
  });
});

describe('fetchWithTimeout redirect safety', () => {
  it('follows safe redirects transparently', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url === 'https://example.com/a') {
          return new Response('', { status: 302, headers: { Location: 'https://example.com/b' } });
        }
        return new Response('ok', { status: 200 });
      }),
    );
    const res = await fetchWithTimeout('https://example.com/a');
    expect(res.status).toBe(200);
    expect(calls).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('refuses a 30x that points at a literal private IP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('', {
          status: 302,
          headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }),
    );
    await expect(fetchWithTimeout('https://example.com/a')).rejects.toThrow(
      /refused to follow redirect.*169\.254\.169\.254/,
    );
  });

  it('refuses a 30x that points at localhost', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('', { status: 302, headers: { Location: 'http://localhost:22/' } });
      }),
    );
    await expect(fetchWithTimeout('https://example.com/a')).rejects.toThrow(
      /refused to follow redirect.*localhost/,
    );
  });

  it('bounds the redirect chain with maxRedirects', async () => {
    let seq = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        seq += 1;
        return new Response('', {
          status: 302,
          headers: { Location: `https://example.com/hop-${seq}` },
        });
      }),
    );
    await expect(
      fetchWithTimeout('https://example.com/start', { maxRedirects: 3 }),
    ).rejects.toThrow(/too many redirects/);
  });
});
