import { afterEach, describe, expect, it, vi } from "vitest";

import { LivenessTracker, LoopLagProbe, runLivenessProbe, STALL_MS } from "./liveness";

function clock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

describe("LivenessTracker", () => {
  it("reports a quiet socket as quiet, not as deaf", () => {
    const time = clock();
    const tracker = new LivenessTracker(time.now);
    time.advance(300_000);
    expect(tracker.sample()).toEqual({
      openForSec: 300,
      frames: 0,
      secSinceLastFrame: null,
      upserts: 0,
      secSinceLastUpsert: null,
      lagMaxMs: 0,
      stalls: 0,
    });
  });

  it("counts frames and upserts per window and keeps the last-seen times", () => {
    const time = clock();
    const tracker = new LivenessTracker(time.now);
    time.advance(10_000);
    tracker.noteFrame();
    tracker.noteFrame();
    tracker.noteUpserts(3);
    time.advance(20_000);
    tracker.noteFrame();
    time.advance(5_000);

    const first = tracker.sample();
    expect(first).toMatchObject({
      openForSec: 35,
      frames: 3,
      secSinceLastFrame: 5,
      upserts: 3,
      secSinceLastUpsert: 25,
    });

    time.advance(60_000);
    const second = tracker.sample();
    expect(second.frames).toBe(0);
    expect(second.upserts).toBe(0);
    expect(second.secSinceLastFrame).toBe(65);
    expect(second.secSinceLastUpsert).toBe(85);
  });

  it("ignores empty or invalid upsert counts", () => {
    const time = clock();
    const tracker = new LivenessTracker(time.now);
    tracker.noteUpserts(0);
    tracker.noteUpserts(-2);
    tracker.noteUpserts(Number.NaN);
    expect(tracker.sample().secSinceLastUpsert).toBeNull();
  });
});

describe("event-loop lag", () => {
  it("reports the longest delay and counts only real stalls per window", () => {
    const time = clock();
    const tracker = new LivenessTracker(time.now);
    tracker.noteLag(0);
    tracker.noteLag(40);
    tracker.noteLag(STALL_MS - 1);
    tracker.noteLag(2_300);
    tracker.noteLag(STALL_MS);
    expect(tracker.sample()).toMatchObject({ lagMaxMs: 2_300, stalls: 2 });
    expect(tracker.sample()).toMatchObject({ lagMaxMs: 0, stalls: 0 });
  });

  it("ignores impossible delays", () => {
    const tracker = new LivenessTracker(clock().now);
    tracker.noteLag(Number.NaN);
    tracker.noteLag(-5);
    tracker.noteLag(Number.POSITIVE_INFINITY);
    expect(tracker.sample()).toMatchObject({ lagMaxMs: 0, stalls: 0 });
  });

  it("measures how late a timer runs, never negative", () => {
    const time = clock();
    const probe = new LoopLagProbe(500, time.now);
    time.advance(500);
    expect(probe.tick()).toBe(0);
    time.advance(2_500);
    expect(probe.tick()).toBe(2_000);
    time.advance(300);
    expect(probe.tick()).toBe(0);
    time.advance(500);
    expect(probe.tick()).toBe(0);
  });
});

describe("runLivenessProbe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is unavailable when the socket has no lookup", async () => {
    await expect(runLivenessProbe(null, 1_000)).resolves.toEqual({
      outcome: "unavailable",
      ms: 0,
    });
  });

  it("reports ok with the round-trip time", async () => {
    const time = clock();
    const result = await runLivenessProbe(
      async () => {
        time.advance(420);
        return [];
      },
      5_000,
      time.now,
    );
    expect(result).toEqual({ outcome: "ok", ms: 420 });
  });

  it("reports an error without throwing", async () => {
    const result = await runLivenessProbe(async () => {
      throw new Error("connection closed");
    }, 5_000);
    expect(result.outcome).toBe("error");
  });

  it("gives up waiting at the deadline and swallows the late rejection", async () => {
    vi.useFakeTimers();
    let rejectLate: (reason: Error) => void = () => undefined;
    const pending = runLivenessProbe(
      () =>
        new Promise((_resolve, reject) => {
          rejectLate = reject;
        }),
      30_000,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toMatchObject({ outcome: "timeout" });
    rejectLate(new Error("Timed Out"));
    await vi.advanceTimersByTimeAsync(0);
  });
});
