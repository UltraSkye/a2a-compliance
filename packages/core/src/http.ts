export const DEFAULT_TIMEOUT_MS = 10_000;

// Cap every agent-card / JSON-RPC response at 2 MB. Agent cards are metadata
// documents — real-world ones are 1–20 kB. Anything dramatically larger is
// either a misconfigured endpoint or an adversary trying to OOM our process.
export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export async function fetchWithTimeout(url: string, opts: FetchOptions = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method: opts.method ?? 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
    };
    if (opts.headers) init.headers = opts.headers;
    if (opts.body !== undefined) init.body = opts.body;
    return await fetch(url, init);
  } finally {
    clearTimeout(t);
  }
}

export class ResponseTooLargeError extends Error {
  constructor(
    public readonly bytesRead: number,
    public readonly cap: number,
  ) {
    super(`response body exceeded ${cap} bytes (read ${bytesRead})`);
    this.name = 'ResponseTooLargeError';
  }
}

/**
 * Read a Response body as text, aborting if it exceeds `maxBytes`.
 * Consults Content-Length first for an early bail, then streams with a
 * running byte count. Callers should catch ResponseTooLargeError.
 */
export async function readCappedText(
  res: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ResponseTooLargeError(declared, maxBytes);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback for mocks / no-body responses: res.text() is bounded by the
    // same fetch machinery; if the body is small, this is cheap.
    return res.text();
  }

  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Ignore.
      }
      throw new ResponseTooLargeError(bytesRead, maxBytes);
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

/** Read a response as JSON with the same size cap. Throws on parse error. */
export async function readCappedJson(
  res: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const text = await readCappedText(res, maxBytes);
  return JSON.parse(text);
}

export function now(): number {
  return performance.now();
}
