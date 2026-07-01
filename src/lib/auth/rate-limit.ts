/**
 * Login rate limiter — per-IP brute-force protection (SEC-001).
 *
 * Strategy (defense in depth, layered with the 1s constant delay + PBKDF2 600k):
 *   1. Sliding-window rate limit: max 5 attempts per 60s per IP. Exceed → 429.
 *   2. Progressive lockout on failures:
 *        3 fails  → 2s lockout
 *        5 fails  → 8s lockout
 *        8 fails  → 60s lockout
 *       10 fails  → 15min lockout
 *      (resets on successful login)
 *   3. Constant 1s delay per attempt (applied in the route, not here) — slows
 *      brute-force without leaking whether the account exists.
 *
 * In-memory (per-process). Sufficient for a single-user local-first Tauri app
 * (one Next.js process per machine). For a future multi-instance Cloudflare
 * Pages deployment, swap the Map for a Redis/Durable-Object backend.
 *
 * NOTE (SEC-022): IP is derived from x-forwarded-for / x-real-ip, which are
 * client-controlled. For the Tauri local-first deployment this is fine
 * (localhost, no proxy spoofing). For Cloudflare Pages, the gateway sets
 * CF-Connecting-IP — the PR that addresses SEC-022 will route through that.
 * For now, this rate limiter raises the bar substantially against the
 * pre-existing zero-protection state.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** ms until the next attempt is allowed (0 if allowed). */
  retryAfterMs: number;
  /** true if the IP is in a failure-induced lockout (not just window-limited). */
  locked: boolean;
}

interface IpEntry {
  /** attempts in the current sliding window */
  windowCount: number;
  windowStart: number;
  /** consecutive failed attempts (resets on success) */
  failCount: number;
  /** ms timestamp until which the IP is locked out */
  lockedUntil: number;
}

const WINDOW_MS = 60_000;
const WINDOW_MAX = 5;

/**
 * Lockout schedule — checked top-down (highest threshold first). On the Nth
 * consecutive failure, the IP is locked for the duration matching its fail
 * count. This gives a progressive backoff: a typo-prone user gets short
 * lockouts, a brute-forcer hits the 15-min wall fast.
 */
const LOCKOUT_SCHEDULE: ReadonlyArray<{ fails: number; lockMs: number }> = [
  { fails: 10, lockMs: 15 * 60_000 }, // 15 min
  { fails: 8, lockMs: 60_000 },       // 1 min
  { fails: 5, lockMs: 8_000 },        // 8s
  { fails: 3, lockMs: 2_000 },        // 2s
];

const entries = new Map<string, IpEntry>();

/** Periodic cleanup of stale entries (every 5 min) to bound memory. */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of entries) {
      // Remove entries that are past their window AND not locked AND have no recent fails
      if (now - e.windowStart > WINDOW_MS && now > e.lockedUntil && e.failCount === 0) {
        entries.delete(ip);
      }
    }
  }, 5 * 60_000).unref?.();
}

/**
 * Check whether an IP may attempt a login right now. Does NOT consume the
 * attempt — call recordLoginAttempt / recordLoginSuccess to update state.
 *
 * Returns { allowed, retryAfterMs, locked }. When not allowed, the route
 * should respond 429 with Retry-After header and NOT process the PIN.
 */
export function checkLoginRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  let e = entries.get(ip);
  if (!e) {
    e = { windowCount: 0, windowStart: now, failCount: 0, lockedUntil: 0 };
    entries.set(ip, e);
  }

  // 1. Failure-induced lockout (highest priority)
  if (now < e.lockedUntil) {
    return { allowed: false, retryAfterMs: e.lockedUntil - now, locked: true };
  }

  // 2. Sliding-window rate limit
  if (now - e.windowStart > WINDOW_MS) {
    // Window expired — reset
    e.windowStart = now;
    e.windowCount = 0;
  }
  if (e.windowCount >= WINDOW_MAX) {
    return {
      allowed: false,
      retryAfterMs: e.windowStart + WINDOW_MS - now,
      locked: false,
    };
  }

  return { allowed: true, retryAfterMs: 0, locked: false };
}

/**
 * Record that an attempt is being made (increments the sliding-window counter).
 * Call this right before processing a login attempt (after checkLoginRateLimit
 * returned allowed).
 */
export function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  let e = entries.get(ip);
  if (!e) {
    e = { windowCount: 0, windowStart: now, failCount: 0, lockedUntil: 0 };
    entries.set(ip, e);
  }
  if (now - e.windowStart > WINDOW_MS) {
    e.windowStart = now;
    e.windowCount = 0;
  }
  e.windowCount++;
}

/**
 * Record a failed login. Applies progressive lockout based on the new fail
 * count. Returns the lockout result (so the route can include Retry-After).
 */
export function recordLoginFailure(ip: string): RateLimitResult {
  const now = Date.now();
  let e = entries.get(ip);
  if (!e) {
    e = { windowCount: 0, windowStart: now, failCount: 0, lockedUntil: 0 };
    entries.set(ip, e);
  }
  e.failCount++;
  // Find the applicable lockout (highest threshold <= failCount)
  for (const tier of LOCKOUT_SCHEDULE) {
    if (e.failCount >= tier.fails) {
      e.lockedUntil = now + tier.lockMs;
      return { allowed: false, retryAfterMs: tier.lockMs, locked: true };
    }
  }
  return { allowed: true, retryAfterMs: 0, locked: false };
}

/**
 * Record a successful login — resets the fail counter + lockout for the IP.
 * (The sliding-window counter is NOT reset — a successful login still counts
 * as one of the 5/min attempts, to prevent a brute-forcer from interleaving
 * successes to reset the window.)
 */
export function recordLoginSuccess(ip: string): void {
  const e = entries.get(ip);
  if (e) {
    e.failCount = 0;
    e.lockedUntil = 0;
  }
}

/** Extract a best-effort client IP from request headers. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip")?.trim() ??
    "unknown"
  );
}

/** Test-only: reset all rate-limit state. */
export function _resetRateLimitForTests(): void {
  entries.clear();
}
