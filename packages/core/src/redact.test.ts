import { describe, expect, it } from 'vitest';
import { redactInText, redactUrl } from './redact.js';

describe('redactUrl', () => {
  it('strips basic-auth userinfo', () => {
    expect(redactUrl('https://alice:hunter2@example.com/api')).toBe('https://example.com/api');
  });

  it('strips username-only', () => {
    expect(redactUrl('https://token@example.com/')).toBe('https://example.com/');
  });

  it('redacts known secret query params', () => {
    const out = redactUrl('https://example.com/api?token=abc&normal=42&api_key=xyz');
    expect(out).toContain('token=%3Credacted%3E'); // <redacted> URL-encoded
    expect(out).toContain('api_key=%3Credacted%3E');
    expect(out).toContain('normal=42');
  });

  it('is case-insensitive on param names', () => {
    expect(redactUrl('https://example.com/?AUTH=xyz&Cookie=yum')).toMatch(/AUTH=%3Credacted%3E/);
  });

  it('preserves the URL when nothing sensitive is present', () => {
    const out = redactUrl('https://example.com/path?q=open');
    expect(out).toBe('https://example.com/path?q=open');
  });

  it('returns non-URL input unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('redactInText', () => {
  it('redacts a URL embedded in a larger error message', () => {
    const msg = 'fetch to https://alice:hunter2@api.example.com/v1?token=xyz failed: ECONNREFUSED';
    const out = redactInText(msg);
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('token=xyz');
    expect(out).toContain('ECONNREFUSED');
  });

  it('handles multiple URLs in one string', () => {
    const out = redactInText('first https://u:p@a.com/ then https://b.com/?secret=yes afterwards');
    expect(out).not.toContain('u:p@');
    expect(out).not.toContain('secret=yes');
  });

  it('leaves plain strings alone', () => {
    expect(redactInText('just a regular message')).toBe('just a regular message');
  });
});
