import type { NextRequest } from 'next/server';

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
// Cap the map so the limiter itself can't be DoS'd by a wide IP spread.
const MAX_TRACKED_IPS = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientKey(req: NextRequest): string {
  // X-Forwarded-For is only trusted when the operator opts in via
  // TRUST_PROXY=1 — otherwise any client can forge their own IP.
  if (process.env.TRUST_PROXY === '1') {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
    const real = req.headers.get('x-real-ip');
    if (real) return real;
  }
  const ip = (req as unknown as { ip?: string }).ip;
  return ip ?? 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function checkRate(key: string, now: number = Date.now()): RateLimitResult {
  pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_IPS) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: MAX_REQUESTS_PER_WINDOW - existing.count,
  };
}

function pruneExpired(now: number): void {
  // Amortised — at most 32 entries per call so a hot path stays O(1).
  let inspected = 0;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
    inspected += 1;
    if (inspected >= 32) break;
  }
}

export function _resetRateLimit(): void {
  buckets.clear();
}
