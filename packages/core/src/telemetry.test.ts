import { afterEach, describe, expect, it } from 'vitest';
import type { CheckResult } from './report.js';
import { _resetOtelCache, withCheckSpan, withRunSpan } from './telemetry.js';

afterEach(() => {
  _resetOtelCache();
});

describe('telemetry (no OpenTelemetry installed)', () => {
  // @opentelemetry/api is not a declared dependency of this package, so
  // these tests exercise the fall-through path: the wrappers behave as
  // thin identity over the user's function.

  it('withRunSpan returns the inner function result', async () => {
    const out = await withRunSpan('https://example.com', async () => 42);
    expect(out).toBe(42);
  });

  it('withRunSpan propagates rejections', async () => {
    await expect(
      withRunSpan('https://example.com', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow(/boom/);
  });

  it('withCheckSpan returns the produced CheckResult', async () => {
    const probe = async (): Promise<CheckResult> => ({
      id: 'x.y',
      title: 'x',
      severity: 'must',
      status: 'pass',
      durationMs: 1,
    });
    const out = await withCheckSpan('probe', { id: 'x.y' }, probe);
    expect(out.status).toBe('pass');
  });

  it('caches the OTel-api lookup so successive calls do not re-import', async () => {
    // First call resolves (and caches) the absence of @opentelemetry/api.
    await withRunSpan('t', async () => 1);
    // Second call should go straight through without trying to import again.
    const before = Date.now();
    for (let i = 0; i < 200; i++) await withRunSpan('t', async () => i);
    const elapsed = Date.now() - before;
    // Generous budget — the path is just a cache hit + inner await.
    expect(elapsed).toBeLessThan(500);
  });
});
