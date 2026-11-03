import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMPILE_CACHE_FAST_INTERVAL_MS,
  COMPILE_CACHE_FAST_UNTIL_MS,
  COMPILE_CACHE_FIRST_FLUSH_MS,
  COMPILE_CACHE_LAST_FLUSH_MS,
  COMPILE_CACHE_SLOW_INTERVAL_MS,
  flushPackagedCompileCache,
  schedulePackagedCompileCacheFlush,
} from "@/lib/runtime/compile-cache";

// Every test here uses a fake flush and fake timers. Only the last describe
// block touches real files, and only inside a child `node` process that has
// its own temporary compile-cache directory.

const ENV_KEY = "NODE_COMPILE_CACHE";
const savedEnv = process.env[ENV_KEY];

function setCacheEnv(value: string | undefined): void {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

/** Offsets (ms after the call) at which the schedule should flush, from the constants only. */
function expectedOffsets(): number[] {
  const offsets: number[] = [];
  let at = COMPILE_CACHE_FIRST_FLUSH_MS;
  while (at <= COMPILE_CACHE_LAST_FLUSH_MS) {
    offsets.push(at);
    at +=
      at < COMPILE_CACHE_FAST_UNTIL_MS
        ? COMPILE_CACHE_FAST_INTERVAL_MS
        : COMPILE_CACHE_SLOW_INTERVAL_MS;
  }
  return offsets;
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let at = from; at <= to; at += step) out.push(at);
  return out;
}

interface FakeHandle {
  ms: number;
  unref: ReturnType<typeof vi.fn>;
}

describe("compile-cache flush schedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setCacheEnv("/fake/node-compile-cache-never-written");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setCacheEnv(savedEnv);
  });

  function start() {
    const t0 = Date.now();
    const times: number[] = [];
    const flush = vi.fn(() => {
      times.push(Date.now() - t0);
    });
    schedulePackagedCompileCacheFlush({ flush });
    return { times, flush };
  }

  it("has the constants the design says", () => {
    expect(COMPILE_CACHE_FIRST_FLUSH_MS).toBe(10_000);
    expect(COMPILE_CACHE_FAST_INTERVAL_MS).toBe(5_000);
    expect(COMPILE_CACHE_FAST_UNTIL_MS).toBe(120_000);
    expect(COMPILE_CACHE_SLOW_INTERVAL_MS).toBe(30_000);
    expect(COMPILE_CACHE_LAST_FLUSH_MS).toBe(600_000);
  });

  it("does not flush before 10 s and flushes for the first time at 10 s", () => {
    const { flush } = start();
    vi.advanceTimersByTime(COMPILE_CACHE_FIRST_FLUSH_MS - 1);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes every 5 s from 10 s up to and including 120 s", () => {
    const { times } = start();
    vi.advanceTimersByTime(120_000);
    expect(times).toEqual(range(10_000, 120_000, 5_000));
    expect(times).toHaveLength(23);
  });

  it("flushes every 30 s after 120 s, the last one at exactly 600 s", () => {
    const { times } = start();
    vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS);
    const late = times.filter((at) => at > 120_000);
    expect(late).toEqual(range(150_000, 600_000, 30_000));
    expect(late).toHaveLength(16);
    expect(times[times.length - 1]).toBe(600_000);
  });

  it("makes exactly the number of flushes the constants imply (39) and none after 600 s", () => {
    const { times, flush } = start();
    vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS);
    expect(times).toEqual(expectedOffsets());
    expect(flush).toHaveBeenCalledTimes(expectedOffsets().length);
    // Pinned literal: a change of the constants must change this number on purpose.
    expect(flush).toHaveBeenCalledTimes(39);
    // Stays well under the ~45 flush budget.
    expect(flush.mock.calls.length).toBeLessThan(45);

    vi.advanceTimersByTime(60 * 60_000);
    expect(flush).toHaveBeenCalledTimes(39);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one chained timer, not one timer per flush", () => {
    start();
    expect(vi.getTimerCount()).toBe(1);
    for (let step = 0; step < 39; step += 1) {
      vi.advanceTimersToNextTimer();
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never flushes twice at the same moment", () => {
    const { times } = start();
    vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS);
    expect(new Set(times).size).toBe(times.length);
  });

  it("keeps going when a flush throws", () => {
    const calls: number[] = [];
    const flush = vi.fn(() => {
      calls.push(calls.length);
      if (calls.length % 2 === 1) throw new Error("disk full");
    });
    schedulePackagedCompileCacheFlush({ flush });
    expect(() => vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS)).not.toThrow();
    expect(flush).toHaveBeenCalledTimes(39);
  });

  it("keeps going when every flush throws", () => {
    const flush = vi.fn(() => {
      throw new Error("always");
    });
    schedulePackagedCompileCacheFlush({ flush });
    expect(() => vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS)).not.toThrow();
    expect(flush).toHaveBeenCalledTimes(39);
  });

  it("unrefs every timer so the schedule never keeps the process alive", () => {
    const pending: Array<{ cb: () => void; handle: FakeHandle }> = [];
    const handles: FakeHandle[] = [];
    const setTimer = vi.fn((cb: () => void, ms: number) => {
      const handle: FakeHandle = { ms, unref: vi.fn() };
      handles.push(handle);
      pending.push({ cb, handle });
      return handle;
    });
    const flush = vi.fn();
    schedulePackagedCompileCacheFlush({ flush, setTimer });

    expect(pending).toHaveLength(1);
    expect(handles[0]?.ms).toBe(10_000);
    while (pending.length > 0) {
      expect(pending).toHaveLength(1);
      pending.shift()?.cb();
    }
    expect(flush).toHaveBeenCalledTimes(39);
    expect(handles).toHaveLength(39);
    for (const handle of handles) expect(handle.unref).toHaveBeenCalledTimes(1);
    // The waits between two flushes are the 5 s and 30 s steps, not absolute offsets.
    expect(handles.map((handle) => handle.ms)).toEqual([
      10_000,
      ...Array<number>(22).fill(5_000),
      ...Array<number>(16).fill(30_000),
    ]);
  });

  it("does not throw out of the caller if the timer cannot be created", () => {
    const setTimer = vi.fn(() => {
      throw new Error("no timers");
    });
    expect(() =>
      schedulePackagedCompileCacheFlush({ flush: vi.fn(), setTimer }),
    ).not.toThrow();
  });

  it("schedules nothing when NODE_COMPILE_CACHE is unset", () => {
    setCacheEnv(undefined);
    const flush = vi.fn();
    const setTimer = vi.fn();
    schedulePackagedCompileCacheFlush({ flush, setTimer });
    schedulePackagedCompileCacheFlush({ flush });
    expect(setTimer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS * 2);
    expect(flush).not.toHaveBeenCalled();
  });

  it("schedules nothing when NODE_COMPILE_CACHE is empty", () => {
    setCacheEnv("");
    const flush = vi.fn();
    schedulePackagedCompileCacheFlush({ flush });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(COMPILE_CACHE_LAST_FLUSH_MS);
    expect(flush).not.toHaveBeenCalled();
  });

  it("with no arguments it flushes through Node's module API", () => {
    const flushCompileCache = vi.fn();
    vi.spyOn(process, "getBuiltinModule").mockImplementation((() => ({
      flushCompileCache,
    })) as never);
    schedulePackagedCompileCacheFlush();
    vi.advanceTimersByTime(COMPILE_CACHE_FIRST_FLUSH_MS - 1);
    expect(flushCompileCache).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flushCompileCache).toHaveBeenCalledTimes(1);
  });
});

describe("flushPackagedCompileCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setCacheEnv(savedEnv);
  });

  it("returns false and does nothing when NODE_COMPILE_CACHE is unset", () => {
    setCacheEnv(undefined);
    const flushCompileCache = vi.fn();
    vi.spyOn(process, "getBuiltinModule").mockImplementation((() => ({
      flushCompileCache,
    })) as never);
    expect(flushPackagedCompileCache()).toBe(false);
    expect(flushCompileCache).not.toHaveBeenCalled();
  });

  it("returns true after calling flushCompileCache once", () => {
    setCacheEnv("/fake/node-compile-cache-never-written");
    const flushCompileCache = vi.fn();
    vi.spyOn(process, "getBuiltinModule").mockImplementation((() => ({
      flushCompileCache,
    })) as never);
    expect(flushPackagedCompileCache()).toBe(true);
    expect(flushCompileCache).toHaveBeenCalledTimes(1);
  });

  it("returns false and does not throw when the module API is missing", () => {
    setCacheEnv("/fake/node-compile-cache-never-written");
    const spy = vi.spyOn(process, "getBuiltinModule");
    spy.mockImplementation((() => undefined) as never);
    expect(() => flushPackagedCompileCache()).not.toThrow();
    expect(flushPackagedCompileCache()).toBe(false);
    spy.mockImplementation((() => ({})) as never);
    expect(flushPackagedCompileCache()).toBe(false);
  });

  it("returns false and does not throw when the flush itself throws", () => {
    setCacheEnv("/fake/node-compile-cache-never-written");
    vi.spyOn(process, "getBuiltinModule").mockImplementation((() => ({
      flushCompileCache: () => {
        throw new Error("EIO");
      },
    })) as never);
    expect(() => flushPackagedCompileCache()).not.toThrow();
    expect(flushPackagedCompileCache()).toBe(false);
  });
});

const nodeModuleApi = process.getBuiltinModule?.("node:module") as
  | { flushCompileCache?: unknown }
  | undefined;
const hasFlushCompileCache = typeof nodeModuleApi?.flushCompileCache === "function";

describe("Node compile cache really writes only what is new (real files, child process)", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  // Runs in a child `node` with its own NODE_COMPILE_CACHE directory, so the
  // test process and the real app cache are never touched.
  const CHILD_SCRIPT = `
    const fs = require("node:fs");
    const path = require("node:path");
    const nodeModule = require("node:module");
    const { MODS, CACHE, FIRST, SECOND } = process.env;
    const count = (dir) => {
      let n = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        n += entry.isDirectory() ? count(path.join(dir, entry.name)) : 1;
      }
      return n;
    };
    const load = (from, to) => {
      for (let i = from; i <= to; i += 1) require(path.join(MODS, "m" + i + ".js"));
    };
    const first = Number(FIRST);
    const second = Number(SECOND);
    const out = { start: count(CACHE) };
    load(1, first);
    out.afterLoad = count(CACHE);
    nodeModule.flushCompileCache();
    out.afterFlush1 = count(CACHE);
    load(first + 1, first + second);
    nodeModule.flushCompileCache();
    out.afterFlush2 = count(CACHE);
    nodeModule.flushCompileCache();
    out.afterFlush3 = count(CACHE);
    process.stdout.write(JSON.stringify(out));
  `;

  it.skipIf(!hasFlushCompileCache)(
    "a second flush writes fewer files than the first and an empty flush writes none",
    () => {
      root = mkdtempSync(join(tmpdir(), "sf-compile-cache-"));
      const mods = join(root, "mods");
      const cache = join(root, "cache");
      mkdirSync(mods);
      mkdirSync(cache);
      const FIRST = 4;
      const SECOND = 1;
      for (let i = 1; i <= FIRST + SECOND; i += 1) {
        writeFileSync(
          join(mods, `m${i}.js`),
          `exports.value${i} = function value${i}(input) { return input + ${i}; };\n`,
        );
      }

      const run = spawnSync(process.execPath, ["-e", CHILD_SCRIPT], {
        env: {
          ...process.env,
          NODE_COMPILE_CACHE: cache,
          MODS: mods,
          CACHE: cache,
          FIRST: String(FIRST),
          SECOND: String(SECOND),
        },
        encoding: "utf8",
        timeout: 45_000,
      });
      expect(run.status, run.stderr).toBe(0);

      const seen = JSON.parse(run.stdout) as Record<
        "start" | "afterLoad" | "afterFlush1" | "afterFlush2" | "afterFlush3",
        number
      >;
      const firstFlush = seen.afterFlush1 - seen.afterLoad;
      const secondFlush = seen.afterFlush2 - seen.afterFlush1;
      const thirdFlush = seen.afterFlush3 - seen.afterFlush2;

      // Nothing is on disk until the first flush: that is the burst we split.
      expect(seen.start).toBe(0);
      expect(seen.afterLoad).toBe(0);
      expect(firstFlush).toBeGreaterThanOrEqual(FIRST);
      expect(secondFlush).toBeGreaterThanOrEqual(1);
      expect(secondFlush).toBeLessThan(firstFlush);
      expect(thirdFlush).toBe(0);
      // The cache dir really holds files (counted again from this process).
      const onDisk = readdirSync(cache, { recursive: true, withFileTypes: true }).filter(
        (entry) => entry.isFile(),
      ).length;
      expect(onDisk).toBe(seen.afterFlush3);
    },
    60_000,
  );
});
