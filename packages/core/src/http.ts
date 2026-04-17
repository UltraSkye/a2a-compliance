export const DEFAULT_TIMEOUT_MS = 10_000;

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

export function now(): number {
  return performance.now();
}
