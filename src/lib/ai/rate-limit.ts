/**
 * Simple in-memory rate limiter for AI routes (Session 30, AUDIT-7 AI4).
 *
 * Gemini free-tier allows 15 requests/day. Without rate limiting, a single
 * user can exhaust the quota in seconds. This is a basic token-bucket per
 * sessionId — production should use Redis or similar, but for a local-first
 * desktop app with one user, in-memory is sufficient.
 *
 * Limits:
 *   - 20 messages per session per hour (generous for normal use)
 *   - 100 messages per user per day (free-tier safety margin)
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const sessionBuckets = new Map<string, Bucket>();
const userBuckets = new Map<string, Bucket>();

const SESSION_LIMIT = 20;
const SESSION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const USER_LIMIT = 100;
const USER_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Evict expired buckets. Called from checkRateLimit on every check so the
 * Maps don't grow unbounded over long-running processes (AI-P2).
 *
 * Each bucket's resetAt is in the past when its window has elapsed, so any
 * entry whose resetAt < now can be safely deleted (the next request for
 * that key will allocate a fresh bucket).
 */
function sweepExpired(now: number): void {
  for (const [key, bucket] of sessionBuckets) {
    if (bucket.resetAt < now) sessionBuckets.delete(key);
  }
  for (const [key, bucket] of userBuckets) {
    if (bucket.resetAt < now) userBuckets.delete(key);
  }
}

/**
 * Check + consume a token. Returns true if allowed, false if rate-limited.
 *
 * The check + increment is performed as a single atomic update per bucket
 * (AI-P3): the bucket is read, validated, mutated, and written back without
 * re-reading from the Map between the limit check and the bump. This avoids
 * the previous TOCTOU where a microtask interleave could let two callers
 * observe the same count and both be admitted.
 *
 * The `userKey` should be a stable identifier for the user/shop (auth
 * session id, machine id, etc.) so the daily cap is enforced across all of
 * their AI chat sessions (AI-P1). Defaults to "default" for backward
 * compatibility — callers should override with a real key.
 */
export function checkRateLimit(
  sessionId: string,
  userKey: string = "default",
): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const now = Date.now();

  // AI-P2: evict expired buckets so the Maps don't leak memory over time.
  // Amortized cheap — only expired entries are touched, and each Map is
  // usually small (one entry per active session/user).
  sweepExpired(now);

  // Session bucket
  let session = sessionBuckets.get(sessionId);
  if (!session || session.resetAt < now) {
    session = { count: 0, resetAt: now + SESSION_WINDOW_MS };
    sessionBuckets.set(sessionId, session);
  }
  if (session.count >= SESSION_LIMIT) {
    return {
      allowed: false,
      reason: `Session rate limit exceeded (${SESSION_LIMIT}/hour)`,
      retryAfterMs: session.resetAt - now,
    };
  }

  // User bucket
  let user = userBuckets.get(userKey);
  if (!user || user.resetAt < now) {
    user = { count: 0, resetAt: now + USER_WINDOW_MS };
    userBuckets.set(userKey, user);
  }
  if (user.count >= USER_LIMIT) {
    return {
      allowed: false,
      reason: `Daily rate limit exceeded (${USER_LIMIT}/day)`,
      retryAfterMs: user.resetAt - now,
    };
  }

  // Consume — atomic update against the bucket reference we just validated
  // (AI-P3). No re-read from the Map between the limit check and the bump.
  session.count++;
  user.count++;
  return { allowed: true };
}
