import { describe, expect, it } from "vitest";

import { createLogRateLimiter } from "@/lib/log-rate-limit";

/**
 * F-0034: a 2-core PC must never pay for logging. At most 30 lines a minute in
 * total and 5 per distinct msg; the line over the limit is dropped and counted,
 * and the next minute's first line is preceded by ONE summary.
 */

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms), set: (value: number) => void (t = value) };
}

const MSGS = ["a", "b", "c", "d", "e", "f"];

function fillWindow(limiter: ReturnType<typeof createLogRateLimiter>): void {
  for (const msg of MSGS) {
    for (let i = 0; i < 5; i += 1) expect(limiter.admit(msg).write).toBe(true);
  }
}

describe("createLogRateLimiter", () => {
  it("admits 30 lines in a minute and drops the 31st", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    fillWindow(limiter);
    expect(limiter.admit("another").write).toBe(false);
  });

  it("admits 5 lines per msg and drops the 6th, but still admits a different msg", () => {
    const limiter = createLogRateLimiter({ now: fakeClock().now });
    for (let i = 0; i < 5; i += 1) expect(limiter.admit("same").write).toBe(true);
    expect(limiter.admit("same").write).toBe(false);
    expect(limiter.admit("different").write).toBe(true);
  });

  it("reports ONE summary with the dropped count at the start of the next minute", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    fillWindow(limiter);
    for (let i = 0; i < 3; i += 1) expect(limiter.admit("overflow").write).toBe(false);
    clock.advance(59_999);
    expect(limiter.admit("overflow")).toEqual({ write: false, summaryCount: 0 });
    clock.advance(1);
    expect(limiter.admit("next")).toEqual({ write: true, summaryCount: 4 });
    expect(limiter.admit("next")).toEqual({ write: true, summaryCount: 0 });
  });

  it("reports nothing when no line was dropped", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    limiter.admit("a");
    clock.advance(120_000);
    expect(limiter.admit("a")).toEqual({ write: true, summaryCount: 0 });
  });

  it("delivers the summary once even when several quiet minutes pass", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    for (let i = 0; i < 7; i += 1) limiter.admit("same");
    clock.advance(5 * 60_000);
    expect(limiter.admit("same")).toEqual({ write: true, summaryCount: 2 });
    expect(limiter.admit("same")).toEqual({ write: true, summaryCount: 0 });
  });

  it("counts the summary line against the new minute, so a minute never holds more than 30 lines", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    fillWindow(limiter);
    limiter.admit("overflow");
    clock.advance(60_000);
    const first = limiter.admit("a");
    expect(first).toEqual({ write: true, summaryCount: 1 });
    let written = 2; // the summary line + the first line
    for (const msg of MSGS) {
      for (let i = 0; i < 5; i += 1) {
        const result = limiter.admit(msg === "a" ? "z" : msg);
        if (result.write) written += 1;
      }
    }
    expect(written).toBe(30);
  });

  it("resets the per-msg budget in a new minute", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    for (let i = 0; i < 6; i += 1) limiter.admit("same");
    clock.advance(60_000);
    expect(limiter.admit("same").write).toBe(true);
  });

  it("does not freeze when the clock moves backwards", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    fillWindow(limiter);
    expect(limiter.admit("x").write).toBe(false);
    clock.advance(-10 * 60_000);
    expect(limiter.admit("x").write).toBe(true);
  });

  it("keeps its memory bounded when every msg is different", () => {
    const clock = fakeClock();
    const limiter = createLogRateLimiter({ now: clock.now });
    for (let i = 0; i < 10_000; i += 1) limiter.admit(`msg-${i}`);
    clock.advance(60_000);
    expect(limiter.admit("again")).toEqual({ write: true, summaryCount: 9_970 });
  });

  it("honours injected limits", () => {
    const limiter = createLogRateLimiter({ now: fakeClock().now, maxPerWindow: 2, maxPerMsg: 1 });
    expect(limiter.admit("a").write).toBe(true);
    expect(limiter.admit("a").write).toBe(false);
    expect(limiter.admit("b").write).toBe(true);
    expect(limiter.admit("c").write).toBe(false);
  });
});
