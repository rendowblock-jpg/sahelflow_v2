import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  getClientIp,
  _resetRateLimitForTests,
  type RateLimitResult,
} from "../rate-limit";

describe("login rate limiter (SEC-001)", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
  });

  describe("sliding-window rate limit (5/min)", () => {
    it("allows up to 5 attempts in a 60s window", () => {
      const ip = "1.2.3.4";
      for (let i = 0; i < 5; i++) {
        expect(checkLoginRateLimit(ip).allowed).toBe(true);
        recordLoginAttempt(ip);
      }
      // 6th should be denied
      const result = checkLoginRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.locked).toBe(false);
    });

    it("returns a retryAfterMs when window is exhausted", () => {
      const ip = "5.6.7.8";
      for (let i = 0; i < 5; i++) {
        checkLoginRateLimit(ip);
        recordLoginAttempt(ip);
      }
      const result = checkLoginRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("isolates IPs — one IP hitting the limit doesn't affect another", () => {
      const ipA = "10.0.0.1";
      const ipB = "10.0.0.2";
      for (let i = 0; i < 5; i++) {
        checkLoginRateLimit(ipA);
        recordLoginAttempt(ipA);
      }
      expect(checkLoginRateLimit(ipA).allowed).toBe(false);
      expect(checkLoginRateLimit(ipB).allowed).toBe(true);
    });
  });

  describe("progressive lockout on failures", () => {
    it("does not lock out after 2 failures", () => {
      const ip = "failer-2";
      recordLoginFailure(ip);
      recordLoginFailure(ip);
      const result = checkLoginRateLimit(ip);
      expect(result.allowed).toBe(true);
      expect(result.locked).toBe(false);
    });

    it("locks out for 2s after 3 consecutive failures", () => {
      const ip = "failer-3";
      let r: RateLimitResult;
      r = recordLoginFailure(ip); // 1
      expect(r.locked).toBe(false);
      r = recordLoginFailure(ip); // 2
      expect(r.locked).toBe(false);
      r = recordLoginFailure(ip); // 3 → lockout
      expect(r.locked).toBe(true);
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(2000);
      expect(r.retryAfterMs).toBeLessThan(3000);
      // checkLoginRateLimit should reflect the lockout
      const check = checkLoginRateLimit(ip);
      expect(check.allowed).toBe(false);
      expect(check.locked).toBe(true);
    });

    it("escalates to 8s lockout after 5 failures", () => {
      const ip = "failer-5";
      for (let i = 0; i < 4; i++) recordLoginFailure(ip);
      const r = recordLoginFailure(ip); // 5th
      expect(r.locked).toBe(true);
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(8000);
      expect(r.retryAfterMs).toBeLessThan(10000);
    });

    it("escalates to 60s lockout after 8 failures", () => {
      const ip = "failer-8";
      for (let i = 0; i < 7; i++) recordLoginFailure(ip);
      const r = recordLoginFailure(ip); // 8th
      expect(r.locked).toBe(true);
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(60_000);
      expect(r.retryAfterMs).toBeLessThan(62_000);
    });

    it("escalates to 15min lockout after 10 failures", () => {
      const ip = "failer-10";
      for (let i = 0; i < 9; i++) recordLoginFailure(ip);
      const r = recordLoginFailure(ip); // 10th
      expect(r.locked).toBe(true);
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(15 * 60_000);
      expect(r.retryAfterMs).toBeLessThanOrEqual(15 * 60_000 + 1000);
    });

    it("15min lockout persists — checkLoginRateLimit stays denied", () => {
      const ip = "brute-forcer";
      for (let i = 0; i < 10; i++) recordLoginFailure(ip);
      // Even after the sliding window would normally reset, the lockout holds
      const check = checkLoginRateLimit(ip);
      expect(check.allowed).toBe(false);
      expect(check.locked).toBe(true);
      expect(check.retryAfterMs).toBeGreaterThan(60_000); // way more than a window
    });
  });

  describe("success resets the fail counter", () => {
    it("recordLoginSuccess clears failCount + lockout", () => {
      const ip = "recovered-user";
      // Accumulate 3 failures → 2s lockout
      for (let i = 0; i < 3; i++) recordLoginFailure(ip);
      expect(checkLoginRateLimit(ip).allowed).toBe(false); // locked

      // Success clears the lockout
      recordLoginSuccess(ip);
      expect(checkLoginRateLimit(ip).allowed).toBe(true);
      expect(checkLoginRateLimit(ip).locked).toBe(false);
    });

    it("after success, fail counter starts fresh (3 fails needed for next lockout)", () => {
      const ip = "fresh-start";
      for (let i = 0; i < 3; i++) recordLoginFailure(ip); // locked
      recordLoginSuccess(ip); // reset

      // Now 2 failures should NOT lock out (counter reset)
      recordLoginFailure(ip);
      recordLoginFailure(ip);
      expect(checkLoginRateLimit(ip).allowed).toBe(true);
      expect(checkLoginRateLimit(ip).locked).toBe(false);
    });
  });

  describe("getClientIp", () => {
    it("extracts the first IP from x-forwarded-for", () => {
      const headers = new Headers({
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      });
      expect(getClientIp(headers)).toBe("1.2.3.4");
    });

    it("falls back to x-real-ip when x-forwarded-for is absent", () => {
      const headers = new Headers({ "x-real-ip": "9.9.9.9" });
      expect(getClientIp(headers)).toBe("9.9.9.9");
    });

    it("returns 'unknown' when neither header is present", () => {
      const headers = new Headers();
      expect(getClientIp(headers)).toBe("unknown");
    });

    it("trims whitespace around the IP", () => {
      const headers = new Headers({ "x-forwarded-for": "  1.2.3.4  " });
      expect(getClientIp(headers)).toBe("1.2.3.4");
    });
  });

  describe("recordLoginAttempt (sliding-window counter)", () => {
    it("increments the window counter independently of fail count", () => {
      const ip = "window-tester";
      checkLoginRateLimit(ip); // allowed
      recordLoginAttempt(ip); // 1
      recordLoginAttempt(ip); // 2
      recordLoginAttempt(ip); // 3
      recordLoginAttempt(ip); // 4
      checkLoginRateLimit(ip); // allowed (4 < 5)
      recordLoginAttempt(ip); // 5
      // 6th check should be denied by the window
      expect(checkLoginRateLimit(ip).allowed).toBe(false);
    });
  });
});
