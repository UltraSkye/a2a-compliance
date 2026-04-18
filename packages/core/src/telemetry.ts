import type { CheckResult } from './report.js';

/**
 * Optional OpenTelemetry instrumentation.
 *
 * Off by default. Opt in by setting `OTEL_EXPORTER_OTLP_ENDPOINT` (or any
 * env that the `@opentelemetry/sdk-node` auto-detects) and importing
 * `@opentelemetry/api` somewhere in the host process — we look it up
 * at call time, so core itself carries no OpenTelemetry dependency.
 *
 * The SDK-node package is *not* bundled here so we don't drag ~10 MB of
 * instrumentation into `@a2a-compliance/core` for users who never use
 * tracing. Operators who want OTel do:
 *
 *   npm i @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
 *   export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel.example.com:4318
 *   node -r ./otel-init.js ./my-probe.js
 *
 * …and every check becomes a span automatically.
 */

interface OtelApi {
  trace: {
    getTracer(
      name: string,
      version?: string,
    ): {
      startActiveSpan<T>(name: string, fn: (span: OtelSpan) => T): T;
    };
  };
  SpanStatusCode: { OK: 1; ERROR: 2 };
}

interface OtelSpan {
  setAttributes(attrs: Record<string, string | number | boolean | undefined>): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(err: unknown): void;
  end(): void;
}

let otelApi: OtelApi | null | undefined; // undefined = not yet resolved; null = absent

async function resolveOtelApi(): Promise<OtelApi | null> {
  if (otelApi !== undefined) return otelApi;
  try {
    // Indirect dynamic import so TypeScript can't resolve it statically —
    // `@opentelemetry/api` is not declared as a dep, it's expected to be
    // peer-installed by operators who want tracing. A normal
    // `import('@opentelemetry/api')` would fail tsc with TS2307.
    //
    // The string template hides the specifier from static analysis; at
    // runtime this is just `import('@opentelemetry/api')`. `catch` swallows
    // MODULE_NOT_FOUND so the common case (no OTel installed) is a
    // silent no-op.
    const specifier = `@opentelemetry/${'api'}`;
    // Function-constructor indirection keeps TypeScript from resolving
    // `@opentelemetry/api` at compile time while still giving us a real
    // dynamic import at runtime. biome's `noCommaOperator` rule doesn't
    // fire on this form.
    const importFn = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
    const mod = (await importFn(specifier).catch(() => null)) as OtelApi | null;
    otelApi = mod;
    return otelApi;
  } catch {
    otelApi = null;
    return null;
  }
}

/**
 * Wrap a check producer so its result is also emitted as an OTel span.
 * When `@opentelemetry/api` isn't importable, falls through to `fn`
 * directly — zero overhead, no errors.
 */
export async function withCheckSpan<T extends CheckResult>(
  spanName: string,
  attrs: { id: string; category?: string; severity?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const api = await resolveOtelApi();
  if (!api) return fn();
  const tracer = api.trace.getTracer('@a2a-compliance/core');
  return tracer.startActiveSpan(spanName, async (span: OtelSpan) => {
    try {
      const result = await fn();
      span.setAttributes({
        'a2a.check.id': attrs.id,
        'a2a.check.category': attrs.category,
        'a2a.check.severity': attrs.severity,
        'a2a.check.status': result.status,
        'a2a.check.duration_ms': result.durationMs,
      });
      span.setStatus({
        code: result.status === 'fail' ? api.SpanStatusCode.ERROR : api.SpanStatusCode.OK,
        ...(result.message ? { message: result.message } : {}),
      });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: api.SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Instrument an entire ComplianceReport run. Emits one parent span that
 * wraps all the child check spans; lets OTel backends show a trace for
 * the whole probe as a waterfall.
 */
export async function withRunSpan<T>(target: string, fn: () => Promise<T>): Promise<T> {
  const api = await resolveOtelApi();
  if (!api) return fn();
  const tracer = api.trace.getTracer('@a2a-compliance/core');
  return tracer.startActiveSpan('a2a-compliance.run', async (span: OtelSpan) => {
    try {
      span.setAttributes({ 'a2a.target': target });
      const result = await fn();
      span.setStatus({ code: api.SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: api.SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Clears the cached OTel-api lookup. Test-only — lets a test inject /
 * remove `@opentelemetry/api` between runs without reloading the module.
 */
export function _resetOtelCache(): void {
  otelApi = undefined;
}
