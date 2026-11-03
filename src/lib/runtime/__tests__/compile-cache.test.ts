import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEventLoopUtilizationSampler,
  flushPackagedCompileCache,
  flushWhenLoopQuiet,
  QUIET_FLUSH_DEFAULTS,
  RUNTIME_FLUSH_DELAYS_MS,
  schedulePackagedCompileCacheFlush,
  type QuietFlushOptions,
} from "../compile-cache";

// F-0014: Node's module.flushCompileCache() is synchronous. On a cold cache it
// wrote about 1,400 files and froze the Node event loop for 1.5-3 s, 90 s after
// launch. The periodic flush stays (it protects the cache when the app is not
// closed normally), but each flush now waits until the event loop has been
// quiet, and flushes anyway after a latest-time limit.
//
// Nothing here touches a real cache directory: the flush is a spy, the clock
// and the timers are Vitest's fake ones, and the utilization numbers are fed in.

const SECOND = 1000;
const { windowMs, quietWindowsRequired, maxWaitMs } = QUIET_FLUSH_DEFAULTS;

/** Utilization provider that plays a script, then repeats its last value. */
function scripted(values: readonly number[]) {
  let index = 0;
  return vi.fn((): number => values[Math.min(index++, values.length - 1)] ?? Number.NaN);
}

/** Wraps the (fake) global setTimeout and records each unref() call. */
function recordingTimer() {
  const timers: { delayMs: number; unref: ReturnType<typeof vi.fn> }[] = [];
  const setTimer: NonNullable<QuietFlushOptions["setTimer"]> = (callback, delayMs) => {
    setTimeout(callback, delayMs);
    const handle = { unref: vi.fn() };
    timers.push({ delayMs, unref: handle.unref });
    return handle;
  };
  return { setTimer, timers };
}

function options(overrides: QuietFlushOptions = {}): QuietFlushOptions {
  return { now: () => Date.now(), ...overrides };
}

describe("flushWhenLoopQuiet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pins the numbers it ships with", () => {
    expect(QUIET_FLUSH_DEFAULTS).toEqual({
      windowMs: 1000,
      quietThreshold: 0.1,
      quietWindowsRequired: 3,
      maxWaitMs: 5 * 60_000,
    });
  });

  it("does not flush at once, and flushes after the loop was quiet for the required windows", () => {
    const flush = vi.fn();
    flushWhenLoopQuiet(options({ flush, sampleUtilization: scripted([0.01, 0.02, 0.0]) }));

    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(windowMs * (quietWindowsRequired - 1));
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(windowMs);
    expect(flush).toHaveBeenCalledTimes(1);

    // Once is enough: later time passing must not flush again.
    vi.advanceTimersByTime(maxWaitMs * 2);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("starts the quiet count again after a busy window", () => {
    const flush = vi.fn();
    // quiet, quiet, BUSY, quiet, quiet, quiet -> only the 6th window flushes
    flushWhenLoopQuiet(
      options({ flush, sampleUtilization: scripted([0.01, 0.02, 0.45, 0.01, 0.02, 0.03]) }),
    );

    vi.advanceTimersByTime(windowMs * 5);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(windowMs);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("treats a window exactly at the threshold as busy", () => {
    const flush = vi.fn();
    flushWhenLoopQuiet(
      options({
        flush,
        sampleUtilization: scripted([QUIET_FLUSH_DEFAULTS.quietThreshold]),
        maxWaitMs: 10 * SECOND,
      }),
    );
    vi.advanceTimersByTime(9 * SECOND);
    expect(flush).not.toHaveBeenCalled();
  });

  it("keeps deferring while the loop stays busy, re-checking every window", () => {
    const flush = vi.fn();
    const sample = scripted([0.9]);
    flushWhenLoopQuiet(options({ flush, sampleUtilization: sample }));

    vi.advanceTimersByTime(maxWaitMs - windowMs);
    expect(flush).not.toHaveBeenCalled();
    // One check per window, not one per tick or one per minute.
    expect(sample).toHaveBeenCalledTimes((maxWaitMs - windowMs) / windowMs);
  });

  it("flushes at the latest-time limit even if the loop is still busy, and then stops checking", () => {
    const flush = vi.fn();
    const sample = scripted([0.95]);
    flushWhenLoopQuiet(options({ flush, sampleUtilization: sample }));

    vi.advanceTimersByTime(maxWaitMs);
    expect(flush).toHaveBeenCalledTimes(1);

    const checks = sample.mock.calls.length;
    vi.advanceTimersByTime(maxWaitMs);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(sample).toHaveBeenCalledTimes(checks);
  });

  it("uses the clock, not a window count, for the limit (a blocked loop fires timers late)", () => {
    const flush = vi.fn();
    let clock = 0;
    const callbacks: (() => void)[] = [];
    flushWhenLoopQuiet({
      flush,
      now: () => clock,
      setTimer: (callback) => {
        callbacks.push(callback);
        return { unref: vi.fn() };
      },
      sampleUtilization: scripted([0.9]),
    });

    clock = maxWaitMs - 1; // first re-check arrives very late but still before the limit
    callbacks.shift()?.();
    expect(flush).not.toHaveBeenCalled();
    clock = maxWaitMs; // next one is at the limit
    callbacks.shift()?.();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes at once, as before, when utilization cannot be measured", () => {
    const flush = vi.fn();
    flushWhenLoopQuiet(options({ flush, sampleUtilization: null }));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes (and does not throw) when sampling throws", () => {
    const flush = vi.fn();
    const sampleUtilization = vi.fn(() => {
      throw new Error("no elu");
    });
    expect(() => {
      flushWhenLoopQuiet(options({ flush, sampleUtilization }));
      vi.advanceTimersByTime(windowMs);
    }).not.toThrow();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("counts a non-number sample as busy instead of flushing on it", () => {
    const flush = vi.fn();
    flushWhenLoopQuiet(
      options({ flush, sampleUtilization: scripted([Number.NaN]), maxWaitMs: 10 * SECOND }),
    );
    vi.advanceTimersByTime(9 * SECOND);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SECOND);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("never throws out of a timer when the flush itself throws", () => {
    const flush = vi.fn(() => {
      throw new Error("disk full");
    });
    flushWhenLoopQuiet(options({ flush, sampleUtilization: scripted([0]) }));
    expect(() => vi.advanceTimersByTime(windowMs * quietWindowsRequired)).not.toThrow();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("unrefs every timer it creates, so waiting never keeps the process alive", () => {
    const { setTimer, timers } = recordingTimer();
    flushWhenLoopQuiet(
      options({ flush: vi.fn(), setTimer, sampleUtilization: scripted([0.5, 0.5, 0, 0, 0]) }),
    );
    vi.advanceTimersByTime(windowMs * 5);

    expect(timers.length).toBeGreaterThanOrEqual(5);
    expect(timers.every((timer) => timer.delayMs === windowMs)).toBe(true);
    for (const timer of timers) expect(timer.unref).toHaveBeenCalledTimes(1);
  });
});

describe("schedulePackagedCompileCacheFlush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_COMPILE_CACHE", "/not/a/real/cache");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("keeps both periodic flushes, at 90 s and 10 min", () => {
    expect(RUNTIME_FLUSH_DELAYS_MS).toEqual([90_000, 600_000]);
  });

  it("schedules nothing when NODE_COMPILE_CACHE is not set", () => {
    vi.stubEnv("NODE_COMPILE_CACHE", "");
    const setTimer = vi.fn(() => ({ unref: vi.fn() }));
    const flush = vi.fn();
    schedulePackagedCompileCacheFlush(options({ flush, setTimer, sampleUtilization: () => 0 }));

    expect(setTimer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(maxWaitMs * 4);
    expect(flush).not.toHaveBeenCalled();
  });

  it("schedules exactly the two delays, each unref'd", () => {
    const { setTimer, timers } = recordingTimer();
    schedulePackagedCompileCacheFlush(
      options({ flush: vi.fn(), setTimer, sampleUtilization: () => 0 }),
    );

    expect(timers.map((timer) => timer.delayMs)).toEqual([90_000, 600_000]);
    for (const timer of timers) expect(timer.unref).toHaveBeenCalledTimes(1);
  });

  it("unrefs the real timers when no scheduler is injected", () => {
    const fakeSetTimeout = globalThis.setTimeout;
    const handles: { hasRef(): boolean }[] = [];
    vi.stubGlobal("setTimeout", (callback: () => void, delayMs: number) => {
      const handle = fakeSetTimeout(callback, delayMs);
      handles.push(handle as unknown as { hasRef(): boolean });
      return handle;
    });
    try {
      schedulePackagedCompileCacheFlush(options({ flush: vi.fn(), sampleUtilization: () => 0 }));
    } finally {
      // Put the fake clock's setTimeout back before useRealTimers() runs.
      vi.unstubAllGlobals();
    }

    expect(handles).toHaveLength(2);
    for (const handle of handles) expect(handle.hasRef()).toBe(false);
  });

  it("flushes once per delay, a few quiet seconds after each timer fires", () => {
    const flush = vi.fn();
    schedulePackagedCompileCacheFlush(options({ flush, sampleUtilization: () => 0.01 }));

    vi.advanceTimersByTime(90_000 - 1);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + windowMs * quietWindowsRequired);
    expect(flush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600_000 - 90_000 - windowMs * quietWindowsRequired - 1);
    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1 + windowMs * quietWindowsRequired);
    expect(flush).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(maxWaitMs * 4);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does not flush at 90 s while the loop is busy, but still does at the limit, and the 10 min flush still happens", () => {
    const flush = vi.fn();
    schedulePackagedCompileCacheFlush(options({ flush, sampleUtilization: () => 0.8 }));

    vi.advanceTimersByTime(90_000 + maxWaitMs - 1);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);

    // The second wait starts at 10 min after launch; it is busy too, so it
    // ends at the limit, 10 min + 5 min after launch.
    vi.advanceTimersByTime(600_000 + maxWaitMs - 1 - (90_000 + maxWaitMs));
    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("does not throw when the flush throws", () => {
    const flush = vi.fn(() => {
      throw new Error("boom");
    });
    schedulePackagedCompileCacheFlush(options({ flush, sampleUtilization: () => 0 }));
    expect(() => vi.advanceTimersByTime(600_000 + 60 * SECOND)).not.toThrow();
    expect(flush).toHaveBeenCalledTimes(2);
  });
});

describe("flushPackagedCompileCache (unchanged: also the shutdown flush)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function stubModuleApi(flushCompileCache: () => void) {
    return vi
      .spyOn(process, "getBuiltinModule" as never)
      .mockImplementation(((id: string) =>
        id === "node:module" ? { flushCompileCache } : undefined) as never);
  }

  it("does nothing and returns false without NODE_COMPILE_CACHE", () => {
    vi.stubEnv("NODE_COMPILE_CACHE", "");
    const flushCompileCache = vi.fn();
    stubModuleApi(flushCompileCache);
    expect(flushPackagedCompileCache()).toBe(false);
    expect(flushCompileCache).not.toHaveBeenCalled();
  });

  it("calls module.flushCompileCache() once and returns true", () => {
    vi.stubEnv("NODE_COMPILE_CACHE", "/not/a/real/cache");
    const flushCompileCache = vi.fn();
    stubModuleApi(flushCompileCache);
    expect(flushPackagedCompileCache()).toBe(true);
    expect(flushCompileCache).toHaveBeenCalledTimes(1);
  });

  it("returns false instead of throwing when Node's flush throws", () => {
    vi.stubEnv("NODE_COMPILE_CACHE", "/not/a/real/cache");
    stubModuleApi(() => {
      throw new Error("EPERM");
    });
    expect(flushPackagedCompileCache()).toBe(false);
  });
});

describe("createEventLoopUtilizationSampler", () => {
  it("reports the utilization of the window since its last call, not since process start", async () => {
    const sample = createEventLoopUtilizationSampler();
    expect(sample).toBeTypeOf("function");
    if (!sample) return;

    const spinUntil = performance.now() + 200;
    while (performance.now() < spinUntil) {
      // keep the loop busy on purpose
    }
    const busy = sample();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const idle = sample();

    expect(busy).toBeGreaterThan(0.5);
    // A since-process-start figure would sit near 0.5 here; a window figure is far below.
    expect(idle).toBeLessThan(0.3);
  });
});
