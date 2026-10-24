import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetRateLimitForTests,
  FAILED_ATTEMPT_MIN_MS,
  MEMBER_BUCKET_CAP,
  checkLoginRateLimit,
  getConfirmationLimiterKey,
  getInvitationAcceptLimiterKey,
  getLoginLimiterKey,
  getMemberLoginLimiterKey,
  getOwnerLoginLimiterKey,
  holdFailedAttempt,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "../rate-limit";

/**
 * IDN-01 / IDN-06 / IDN-07: the limiter bucket is the ACCOUNT (or the verified
 * session) being tried, never a value the caller can rotate. One account's
 * failures, floods or successes must not change another account's allowance.
 */
beforeEach(() => {
  _resetRateLimitForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

function lock(key: string): void {
  for (let i = 0; i < 10; i++) recordLoginFailure(key);
}

describe("limiter keys are namespaced and server-derived", () => {
  it("keeps owner login, member login, confirmation and invitation buckets apart", () => {
    const keys = [
      getOwnerLoginLimiterKey(),
      getMemberLoginLimiterKey("amina.ops"),
      getMemberLoginLimiterKey("karim.ops"),
      getConfirmationLimiterKey("session-a"),
      getConfirmationLimiterKey("session-b"),
      getInvitationAcceptLimiterKey(),
      getLoginLimiterKey(new Headers()),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("treats the same login id typed in another case or with spaces as one account", () => {
    expect(getMemberLoginLimiterKey(" Amina.Ops ")).toBe(
      getMemberLoginLimiterKey("amina.ops"),
    );
  });

  it("does not let a client header change the unattributed bucket", () => {
    const clean = getLoginLimiterKey(new Headers());
    const spoofed = getLoginLimiterKey(
      new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.1" }),
    );
    expect(spoofed).toBe(clean);
  });

  it("sends malformed or oversized login ids to the shared overflow bucket", () => {
    const overflow = getMemberLoginLimiterKey("x".repeat(100));
    expect(getMemberLoginLimiterKey("a:b")).toBe(overflow);
    expect(getMemberLoginLimiterKey("")).toBe(overflow);
    expect(overflow).not.toBe(getOwnerLoginLimiterKey());
  });
});

describe("one account's failures never reach another account (IDN-06)", () => {
  it("a locked member leaves the owner, other members and other doors untouched", () => {
    lock(getMemberLoginLimiterKey("bad.actor"));
    expect(checkLoginRateLimit(getMemberLoginLimiterKey("bad.actor"))).toMatchObject({
      allowed: false,
      locked: true,
    });
    for (const other of [
      getOwnerLoginLimiterKey(),
      getMemberLoginLimiterKey("amina.ops"),
      getConfirmationLimiterKey("owner-session"),
      getInvitationAcceptLimiterKey(),
      getLoginLimiterKey(new Headers()),
    ]) {
      expect(checkLoginRateLimit(other).allowed).toBe(true);
    }
  });

  it("a locked owner leaves every member able to sign in", () => {
    lock(getOwnerLoginLimiterKey());
    expect(checkLoginRateLimit(getOwnerLoginLimiterKey()).allowed).toBe(false);
    expect(checkLoginRateLimit(getMemberLoginLimiterKey("amina.ops")).allowed).toBe(true);
  });

  it("a flood of attempts on one member does not use up the owner's window", () => {
    const flooded = getMemberLoginLimiterKey("bad.actor");
    for (let i = 0; i < 5; i++) recordLoginAttempt(flooded);
    expect(checkLoginRateLimit(flooded).allowed).toBe(false);
    const owner = getOwnerLoginLimiterKey();
    for (let i = 0; i < 5; i++) {
      expect(checkLoginRateLimit(owner).allowed).toBe(true);
      recordLoginAttempt(owner);
    }
  });

  it("a success on one account does not clear another account's failures", () => {
    const owner = getOwnerLoginLimiterKey();
    for (let i = 0; i < 3; i++) recordLoginFailure(owner);
    expect(checkLoginRateLimit(owner).locked).toBe(true);
    recordLoginSuccess(getMemberLoginLimiterKey("amina.ops"));
    expect(checkLoginRateLimit(owner).locked).toBe(true);
  });

  it("still enforces the same 5-per-minute window and lockout on a single account", () => {
    const owner = getOwnerLoginLimiterKey();
    for (let i = 0; i < 5; i++) recordLoginAttempt(owner);
    expect(checkLoginRateLimit(owner)).toMatchObject({ allowed: false, locked: false });
    _resetRateLimitForTests();
    expect(recordLoginFailure(owner).locked).toBe(false);
    expect(recordLoginFailure(owner).locked).toBe(false);
    expect(recordLoginFailure(owner)).toMatchObject({ locked: true, retryAfterMs: 2_000 });
  });
});

describe("member buckets are bounded", () => {
  it("shares one overflow bucket once the cap is reached and never evicts a tracked account", () => {
    const tracked: string[] = [];
    for (let i = 0; i < MEMBER_BUCKET_CAP; i++) {
      const key = getMemberLoginLimiterKey(`m${i}.x`);
      recordLoginAttempt(key);
      tracked.push(key);
    }
    expect(new Set(tracked).size).toBe(MEMBER_BUCKET_CAP);

    const late = getMemberLoginLimiterKey("brand.new");
    expect(getMemberLoginLimiterKey("another.new")).toBe(late);
    expect(tracked).not.toContain(late);

    // An account that already has state keeps its own bucket.
    expect(getMemberLoginLimiterKey("m0.x")).toBe(tracked[0]);

    // The owner is never subject to the cap.
    expect(getOwnerLoginLimiterKey()).toBe("login:owner");
    expect(checkLoginRateLimit(getOwnerLoginLimiterKey()).allowed).toBe(true);
  });
});

describe("idle failed member buckets are evicted (LEAD-01)", () => {
  const IDLE_MS = 15 * 60_000;

  function fillWithFailedJunkIds(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < MEMBER_BUCKET_CAP; i++) {
      const key = getMemberLoginLimiterKey(`junk${i}.x`);
      recordLoginAttempt(key);
      // Two failures: below the first lockout, so one more would lock the bucket.
      recordLoginFailure(key);
      recordLoginFailure(key);
      keys.push(key);
    }
    return keys;
  }

  it("lets an unseen member get its own bucket once the failed junk ids have been idle for 15 minutes", () => {
    vi.useFakeTimers();
    fillWithFailedJunkIds();
    const overflow = getMemberLoginLimiterKey("unseen.one");
    expect(overflow).toBe(getMemberLoginLimiterKey("unseen.two"));

    vi.advanceTimersByTime(IDLE_MS + 1);
    const own = getMemberLoginLimiterKey("unseen.one");
    expect(own).toBe("login:member:unseen.one");
    expect(own).not.toBe(overflow);
    expect(getMemberLoginLimiterKey("unseen.two")).toBe("login:member:unseen.two");
  });

  it("keeps a failed bucket that is not yet 15 minutes idle", () => {
    vi.useFakeTimers();
    fillWithFailedJunkIds();
    vi.advanceTimersByTime(IDLE_MS - 1_000);
    const overflow = getMemberLoginLimiterKey("unseen.one");
    expect(overflow).toBe("login:member:*");
  });

  it("drops the failure count of an evicted bucket and keeps one that was used again", () => {
    vi.useFakeTimers();
    const keys = fillWithFailedJunkIds();
    vi.advanceTimersByTime(IDLE_MS - 1_000);
    recordLoginFailure(keys[0] as string); // still active: its idle clock restarts
    vi.advanceTimersByTime(2_000);

    getMemberLoginLimiterKey("unseen.one"); // at the cap: sweeps idle buckets
    // keys[0] is still tracked with its failures: the next one keeps it locked.
    expect(recordLoginFailure(keys[0] as string).locked).toBe(true);
    // keys[1] was evicted and starts from zero: one failure does not lock it.
    expect(recordLoginFailure(keys[1] as string).locked).toBe(false);
  });

  it("never evicts a bucket that is still locked out", () => {
    vi.useFakeTimers();
    const key = getMemberLoginLimiterKey("locked.one");
    lock(key); // 10 failures: 15 minute lockout
    vi.advanceTimersByTime(IDLE_MS - 1_000);
    for (let i = 1; i < MEMBER_BUCKET_CAP; i++) {
      recordLoginFailure(getMemberLoginLimiterKey(`filler${i}.x`));
    }
    getMemberLoginLimiterKey("unseen.one");
    expect(checkLoginRateLimit(key)).toMatchObject({ allowed: false, locked: true });
  });
});

describe("a failed sign-in is held to a minimum duration (IDN-07)", () => {
  it("waits out the rest of the floor and no longer", async () => {
    vi.useFakeTimers();
    let done = false;
    void holdFailedAttempt(Date.now()).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(FAILED_ATTEMPT_MIN_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it("does not wait at all when the attempt already took longer than the floor", async () => {
    vi.useFakeTimers();
    await holdFailedAttempt(Date.now() - 2 * FAILED_ATTEMPT_MIN_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never waits longer than the floor, whatever the start time says", async () => {
    vi.useFakeTimers();
    let done = false;
    void holdFailedAttempt(Date.now() + 60_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(FAILED_ATTEMPT_MIN_MS);
    expect(done).toBe(true);
  });
});
