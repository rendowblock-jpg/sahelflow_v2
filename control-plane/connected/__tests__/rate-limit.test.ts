import { describe, expect, it } from "vitest";
import {
  RATE_PRUNE_AGE_MS,
  RATE_PRUNE_BATCH,
  RATE_RULES,
  decideRate,
  pruneBeforeMs,
  windowStartMs,
} from "../rate-limit";

const MINUTE = 60_000;

describe("RATE_RULES", () => {
  it("are the numbers the brief decided", () => {
    expect(RATE_RULES.exchange_ip).toEqual({ limit: 10, windowMs: MINUTE });
    expect(RATE_RULES.exchange_pairing_failure).toEqual({ limit: 5, windowMs: MINUTE });
    expect(RATE_RULES.command_submit).toEqual({ limit: 30, windowMs: MINUTE });
    expect(RATE_RULES.projection_get).toEqual({ limit: 60, windowMs: MINUTE });
    expect(RATE_PRUNE_AGE_MS).toBe(10 * MINUTE);
    expect(RATE_PRUNE_BATCH).toBe(100);
  });
});

describe("windowStartMs", () => {
  it.each([
    [0, 0],
    [1, 0],
    [59_999, 0],
    [60_000, 60_000],
    [60_001, 60_000],
    [125_000, 120_000],
    [1_800_000_123_456, 1_800_000_120_000],
  ])("floors %i to %i", (now, start) => {
    expect(windowStartMs(now, MINUTE)).toBe(start);
  });
});

describe("decideRate (count includes the request being decided)", () => {
  const at = (count: number, nowMs: number, limit = 10) => decideRate({ count, limit, nowMs, windowMs: MINUTE });

  it("allows up to the limit and refuses the next one", () => {
    expect(at(1, 0).allowed).toBe(true);
    expect(at(9, 0).allowed).toBe(true);
    expect(at(10, 0).allowed).toBe(true);
    expect(at(11, 0).allowed).toBe(false);
    expect(at(500, 0).allowed).toBe(false);
  });

  it("reports what is left, never below zero", () => {
    expect(at(1, 0).remaining).toBe(9);
    expect(at(10, 0).remaining).toBe(0);
    expect(at(11, 0).remaining).toBe(0);
  });

  it("tells when the window ends, in whole seconds, at least 1", () => {
    expect(at(11, 0).retryAfterSeconds).toBe(60);
    expect(at(11, 1_000).retryAfterSeconds).toBe(59);
    expect(at(11, 20_000).retryAfterSeconds).toBe(40);
    expect(at(11, 59_001).retryAfterSeconds).toBe(1);
    expect(at(11, 59_999).retryAfterSeconds).toBe(1);
    expect(at(11, 60_000).retryAfterSeconds).toBe(60);
    expect(at(11, 3 * MINUTE + 30_500).retryAfterSeconds).toBe(30);
  });

  it("is a fresh window one millisecond after the boundary", () => {
    const end = decideRate({ count: 11, limit: 10, nowMs: 59_999, windowMs: MINUTE });
    const next = decideRate({ count: 1, limit: 10, nowMs: 60_000, windowMs: MINUTE });
    expect(end.allowed).toBe(false);
    expect(next.allowed).toBe(true);
    expect(next.windowStartMs).toBe(60_000);
    expect(end.windowStartMs).toBe(0);
  });

  it("works for the failure limit of 5 (count = failures so far + this attempt)", () => {
    const rule = RATE_RULES.exchange_pairing_failure;
    const decide = (failuresSoFar: number) =>
      decideRate({ count: failuresSoFar + 1, limit: rule.limit, nowMs: 5_000, windowMs: rule.windowMs });
    expect(decide(0).allowed).toBe(true);
    expect(decide(4).allowed).toBe(true);
    expect(decide(5).allowed).toBe(false);
  });

  it("refuses a nonsense limit instead of allowing everything", () => {
    expect(() => decideRate({ count: 1, limit: 0, nowMs: 0, windowMs: MINUTE })).toThrow();
    expect(() => decideRate({ count: 1, limit: 5, nowMs: 0, windowMs: 0 })).toThrow();
    expect(() => decideRate({ count: 0, limit: 5, nowMs: 0, windowMs: MINUTE })).toThrow();
  });
});

describe("pruneBeforeMs", () => {
  it("is exactly ten minutes before now", () => {
    expect(pruneBeforeMs(20 * MINUTE)).toBe(10 * MINUTE);
    expect(pruneBeforeMs(10 * MINUTE)).toBe(0);
  });
});
