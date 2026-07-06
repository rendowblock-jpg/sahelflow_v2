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

/** Check + consume a token. Returns true if allowed, false if rate-limited. */
export function checkRateLimit(
  sessionId: string,
  userKey: string = "default",
): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const now = Date.now();

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

  // Consume
  session.count++;
  user.count++;
  return { allowed: true };
}
