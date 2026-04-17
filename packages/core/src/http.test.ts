import { describe, expect, it } from 'vitest';
import { ResponseTooLargeError, readCappedText } from './http.js';

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
