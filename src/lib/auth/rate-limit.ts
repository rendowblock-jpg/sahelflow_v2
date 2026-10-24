/**
 * Login rate limiter — per-account brute-force protection (SEC-001).
 *
 * Strategy (defense in depth, layered with the failed-attempt floor + PBKDF2 600k):
 *   1. Sliding-window rate limit: max 5 attempts per 60s per bucket. Exceed → 429.
 *   2. Progressive lockout on failures:
 *        3 fails  → 2s lockout
 *        5 fails  → 8s lockout
 *        8 fails  → 60s lockout
 *       10 fails  → 15min lockout
 *      (resets on successful login of the SAME bucket)
 *   3. A failed sign-in is held to a minimum duration of FAILED_ATTEMPT_MIN_MS
 *      (holdFailedAttempt, applied by the login route to failures only; a
 *      correct credential is never delayed). It slows guessing and hides
 *      whether a login id exists: an unknown id fails fast, a known id with a
 *      wrong PIN pays for PBKDF2, and the floor makes both look the same.
 *
 * In-memory (per-process). Sufficient for a single-user local-first Tauri app
 * (one Next.js process per machine). For a future multi-instance Cloudflare
 * Pages deployment, swap the Map for a Redis/Durable-Object backend.
 *
 * WHAT A BUCKET IS KEYED ON (audit 7-a F14 / SEC-022, IDN-01, IDN-06):
 * never on anything the caller chooses. Headers such as x-forwarded-for and
 * x-real-ip are client-supplied: keying on them lets a caller replay a fresh
 * value on every request and meet a new, empty bucket. On this loopback-only
 * deployment the network source is the same for everybody, so the trustworthy
 * identity is the account (or the verified session) being tried:
 *   - owner sign-in                -> getOwnerLoginLimiterKey()
 *   - team sign-in                 -> getMemberLoginLimiterKey(loginId), bounded
 *   - PIN proof for a live session -> getConfirmationLimiterKey(sessionId)
 *   - public invitation acceptance -> getInvitationAcceptLimiterKey()
 *   - a body naming no account     -> getLoginLimiterKey(headers) (one shared
 *                                     bucket, so junk traffic cannot spend an
 *                                     account's allowance)
 * Separate buckets never share counters, so one account's failures, floods or
 * successes cannot lock another account out. A bucket's own failures still lock
 * that bucket: that is the brute-force protection. The spoofable header values
 * remain available through getClientIp for audit metadata only. A future
 * multi-tenant gateway deployment must key on a gateway-ATTESTED address
 * (e.g. an edge-overwritten CF-Connecting-IP behind a verified Cloudflare
 * deployment), never on a client-supplied header.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** ms until the next attempt is allowed (0 if allowed). */
  retryAfterMs: number;
  /** true if the bucket is in a failure-induced lockout (not just window-limited). */
  locked: boolean;
}

interface BucketEntry {
  /** attempts in the current sliding window */
  windowCount: number;
  windowStart: number;
  /** consecutive failed attempts (resets on success) */
  failCount: number;
  /** ms timestamp until which the bucket is locked out */
  lockedUntil: number;
  /** ms timestamp of the last attempt or failure (drives idle eviction) */
  lastSeen: number;
}

const WINDOW_MS = 60_000;
const WINDOW_MAX = 5;

/** A failed sign-in answers no sooner than this after the request arrived. */
export const FAILED_ATTEMPT_MIN_MS = 1_000;

/**
 * Team-member buckets are keyed on a client-typed login id, so their number is
 * bounded: past this many tracked accounts, unseen ids share one overflow
 * bucket. A bucket is only evicted once it is idle and not locked out (see
 * FAILED_BUCKET_IDLE_MS), so junk ids cannot hold the cap for ever. A real shop
 * has a handful of members.
 */
export const MEMBER_BUCKET_CAP = 256;

/**
 * A bucket with failures is dropped after this long without an attempt. It is
 * as long as the longest lockout, so a locked bucket is never dropped early.
 */
export const FAILED_BUCKET_IDLE_MS = 15 * 60_000;

/**
 * Lockout schedule — checked top-down (highest threshold first). On the Nth
 * consecutive failure, the bucket is locked for the duration matching its fail
 * count. This gives a progressive backoff: a typo-prone user gets short
 * lockouts, a brute-forcer hits the 15-min wall fast.
 */
const LOCKOUT_SCHEDULE: ReadonlyArray<{ fails: number; lockMs: number }> = [
  { fails: 10, lockMs: 15 * 60_000 }, // 15 min
  { fails: 8, lockMs: 60_000 },       // 1 min
  { fails: 5, lockMs: 8_000 },        // 8s
  { fails: 3, lockMs: 2_000 },        // 2s
];

const entries = new Map<string, BucketEntry>();

/** Drop idle buckets: no failures after one window, with failures after FAILED_BUCKET_IDLE_MS. */
function sweepIdleBuckets(now: number): void {
  for (const [key, e] of entries) {
    const idleMs = e.failCount === 0 ? WINDOW_MS : FAILED_BUCKET_IDLE_MS;
    if (now > e.lockedUntil && now - e.lastSeen > idleMs) entries.delete(key);
  }
}

/** Periodic cleanup of stale entries (every 5 min) to bound memory. */
if (typeof setInterval !== "undefined") {
  setInterval(() => sweepIdleBuckets(Date.now()), 5 * 60_000).unref?.();
}

function freshEntry(now: number): BucketEntry {
  return { windowCount: 0, windowStart: now, failCount: 0, lockedUntil: 0, lastSeen: now };
}

/**
 * Check whether a bucket may attempt a login right now. Does NOT consume the
 * attempt — call recordLoginAttempt / recordLoginSuccess to update state. It
 * also does not create state: an unseen key is simply allowed.
 *
 * Returns { allowed, retryAfterMs, locked }. When not allowed, the route
 * should respond 429 with Retry-After header and NOT process the PIN.
 */
export function checkLoginRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const e = entries.get(key);
  if (!e) return { allowed: true, retryAfterMs: 0, locked: false };

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
export function recordLoginAttempt(key: string): void {
  const now = Date.now();
  let e = entries.get(key);
  if (!e) {
    e = freshEntry(now);
    entries.set(key, e);
  }
  if (now - e.windowStart > WINDOW_MS) {
    e.windowStart = now;
    e.windowCount = 0;
  }
  e.windowCount++;
  e.lastSeen = now;
}

/**
 * Record a failed login. Applies progressive lockout based on the new fail
 * count. Returns the lockout result (so the route can include Retry-After).
 */
export function recordLoginFailure(key: string): RateLimitResult {
  const now = Date.now();
  let e = entries.get(key);
  if (!e) {
    e = freshEntry(now);
    entries.set(key, e);
  }
  e.failCount++;
  e.lastSeen = now;
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
 * Record a successful login — resets the fail counter + lockout for the bucket.
 * (The sliding-window counter is NOT reset — a successful login still counts
 * as one of the 5/min attempts, to prevent a brute-forcer from interleaving
 * successes to reset the window.)
 */
export function recordLoginSuccess(key: string): void {
  const e = entries.get(key);
  if (e) {
    e.failCount = 0;
    e.lockedUntil = 0;
  }
}

/**
 * Hold a FAILED sign-in until FAILED_ATTEMPT_MIN_MS has passed since the
 * request arrived (`startedAtMs`). Call it only on the failure path, after the
 * failure has been recorded; a correct credential must never wait. It waits
 * only for what is left of the floor, never longer than the floor itself.
 */
export async function holdFailedAttempt(startedAtMs: number): Promise<void> {
  const remaining = Math.min(
    FAILED_ATTEMPT_MIN_MS,
    FAILED_ATTEMPT_MIN_MS - (Date.now() - startedAtMs),
  );
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}

const UNATTRIBUTED_LIMITER_KEY = "loopback";
const OWNER_LOGIN_KEY = "login:owner";
const MEMBER_KEY_PREFIX = "login:member:";
const MEMBER_OVERFLOW_KEY = `${MEMBER_KEY_PREFIX}*`;
const CONFIRMATION_KEY_PREFIX = "confirm:session:";
const INVITATION_ACCEPT_KEY = "invitation:accept";
/** Same shape the login schema enforces; anything else is not a real login id. */
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * Bucket for a request that names no account (a malformed login body). One
 * shared, stable key, so such traffic can neither rotate to a fresh bucket nor
 * spend the owner's or a member's allowance (audit 7-a F14). The headers
 * parameter is reserved for a future gateway-attested identity seam;
 * client-supplied headers are deliberately not read here.
 */
export function getLoginLimiterKey(_headers: Headers): string {
  return UNATTRIBUTED_LIMITER_KEY;
}

/** Bucket for the owner PIN sign-in. */
export function getOwnerLoginLimiterKey(): string {
  return OWNER_LOGIN_KEY;
}

function trackedMemberBuckets(): number {
  let count = 0;
  for (const key of entries.keys()) {
    if (key.startsWith(MEMBER_KEY_PREFIX) && key !== MEMBER_OVERFLOW_KEY) count++;
  }
  return count;
}

/**
 * Bucket for one team login id. The id is typed by the caller, so it only ever
 * selects WHICH account's budget is spent; rotating ids never grants extra
 * guesses against any real account. Memory is bounded by MEMBER_BUCKET_CAP.
 */
export function getMemberLoginLimiterKey(loginId: string): string {
  const normalised = loginId.trim().toLowerCase();
  if (!LOGIN_ID_PATTERN.test(normalised)) return MEMBER_OVERFLOW_KEY;
  const key = `${MEMBER_KEY_PREFIX}${normalised}`;
  if (entries.has(key)) return key;
  // At the cap, free idle buckets first so stale junk ids do not push real members to the overflow bucket.
  if (trackedMemberBuckets() >= MEMBER_BUCKET_CAP) sweepIdleBuckets(Date.now());
  return trackedMemberBuckets() < MEMBER_BUCKET_CAP ? key : MEMBER_OVERFLOW_KEY;
}

/**
 * Bucket for PIN proofs made from a live session (re-authentication, owner and
 * member PIN change). `sessionId` must come from the verified session, never
 * from the request.
 */
export function getConfirmationLimiterKey(sessionId: string): string {
  return `${CONFIRMATION_KEY_PREFIX}${sessionId.slice(0, 256)}`;
}

/** Bucket for the public invitation-acceptance door (the token is the credential). */
export function getInvitationAcceptLimiterKey(): string {
  return INVITATION_ACCEPT_KEY;
}

/**
 * Extract a best-effort client IP from request headers. AUDIT METADATA ONLY —
 * this value is client-controlled and must never be used as a limiter bucket
 * key (see the key helpers above).
 */
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
