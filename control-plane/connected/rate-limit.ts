// Fixed-window rate limits for the phone-facing routes. The decision is a pure
// function; the counters live in D1 (worker.ts). Windows are one minute, so
// every counter row is keyed by (bucket, subject, window start).

export type RateBucket =
  | "exchange_ip"
  | "exchange_pairing_failure"
  | "command_submit"
  | "projection_get";

export type RateRule = Readonly<{ limit: number; windowMs: number }>;

const MINUTE_MS = 60_000;

export const RATE_RULES: Readonly<Record<RateBucket, RateRule>> = {
  exchange_ip: { limit: 10, windowMs: MINUTE_MS },
  exchange_pairing_failure: { limit: 5, windowMs: MINUTE_MS },
  command_submit: { limit: 30, windowMs: MINUTE_MS },
  projection_get: { limit: 60, windowMs: MINUTE_MS },
};

/** Counter rows older than this are deleted, at most RATE_PRUNE_BATCH per request. */
export const RATE_PRUNE_AGE_MS = 10 * MINUTE_MS;
export const RATE_PRUNE_BATCH = 100;

export function windowStartMs(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs) * windowMs;
}

export function pruneBeforeMs(nowMs: number): number {
  return nowMs - RATE_PRUNE_AGE_MS;
}

export type RateDecision = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  windowStartMs: number;
}>;

/**
 * `count` is how many events the window holds INCLUDING the one being decided.
 * The request is allowed while count <= limit. Retry-After is the time to the
 * end of the window in whole seconds, never less than 1.
 */
export function decideRate(input: {
  count: number;
  limit: number;
  nowMs: number;
  windowMs: number;
}): RateDecision {
  const { count, limit, nowMs, windowMs } = input;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("rate limit is invalid");
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new RangeError("rate window is invalid");
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError("rate count is invalid");
  const start = windowStartMs(nowMs, windowMs);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - nowMs) / 1000)),
    windowStartMs: start,
  };
}
