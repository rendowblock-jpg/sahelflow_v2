import { describe, expect, it } from "vitest";

import {
  UI_TIMING_BYTES_KEYS,
  UI_TIMING_COUNT_KEYS,
  UI_TIMING_MAX_BYTES,
  UI_TIMING_MAX_COUNT,
  UI_TIMING_MAX_MS,
  UI_TIMING_MS_KEYS,
  UI_TIMING_SLOW_NAME_MAX,
  buildUiTiming,
  readLargestContentfulPaint,
} from "@/lib/runtime/ui-timing";

const ALL_KEYS = [...UI_TIMING_MS_KEYS, ...UI_TIMING_COUNT_KEYS, ...UI_TIMING_BYTES_KEYS].sort();

type Entries = Record<string, unknown>;

function fakePerformance(entries: Entries, nowMs = 27_123.7) {
  return {
    now: () => nowMs,
    getEntriesByType: (type: string) => {
      const value = entries[type];
      if (value instanceof Error) throw value;
      return value ?? [];
    },
  };
}

const NAVIGATION = {
  responseStart: 812.4,
  domInteractive: 6100.4,
  responseEnd: 9034.6,
  domContentLoadedEventEnd: 15_101,
  loadEventEnd: 0,
};

describe("buildUiTiming", () => {
  it("turns a full set of browser entries into whole milliseconds, counts and bytes", () => {
    const result = buildUiTiming(
      fakePerformance({
        navigation: [{ ...NAVIGATION, loadEventEnd: 26_000.5 }],
        paint: [
          { name: "first-paint", startTime: 900 },
          { name: "first-contentful-paint", startTime: 14_000.2 },
        ],
        resource: [
          { name: "http://127.0.0.1:3101/_next/static/chunks/a.js?v=1", initiatorType: "script", transferSize: 1000, decodedBodySize: 4000, duration: 800.4 },
          { name: "http://127.0.0.1:3101/_next/static/chunks/b.js", initiatorType: "script", transferSize: 500.4, decodedBodySize: 2500, duration: 12_000.6 },
          { name: "http://127.0.0.1:3101/_next/static/css/site.css", initiatorType: "link", transferSize: 300, decodedBodySize: 900, duration: 300 },
          { name: "http://127.0.0.1:3101/api/x", initiatorType: "fetch", transferSize: 50, decodedBodySize: 80, duration: 50.2 },
        ],
      }),
      { largestContentfulPaintMs: 20_000.4 },
    );
    expect(result).toEqual({
      responseStartMs: 812,
      responseEndMs: 9035,
      domInteractiveMs: 6100,
      largestContentfulPaintMs: 20_000,
      domContentLoadedEventEndMs: 15_101,
      loadEventEndMs: 26_001,
      firstContentfulPaintMs: 14_000,
      beaconMs: 27_124,
      scriptCount: 2,
      scriptTransferBytes: 1500,
      scriptDecodedBytes: 6500,
      resourceCount: 4,
      resourceTransferBytes: 1850,
      slowResources: [
        { name: "/_next/static/chunks/b.js", ms: 12_001 },
        { name: "/_next/static/chunks/a.js", ms: 800 },
        { name: "/_next/static/css/site.css", ms: 300 },
      ],
    });
  });

  it("carries numbers and static file paths only: no origin, query, title or page path", () => {
    const result = buildUiTiming(
      fakePerformance({
        navigation: [{ ...NAVIGATION, name: "http://127.0.0.1:3101/dashboard?secret=1", title: "Ahmed shop" }],
        paint: [{ name: "first-contentful-paint", startTime: 100, detail: "private" }],
        resource: [
          { name: "http://127.0.0.1:3101/_next/static/chunks/a.js?token=abc#frag", initiatorType: "script", transferSize: 1, decodedBodySize: 2, duration: 9 },
          { name: "http://127.0.0.1:3101/api/orders/4471?phone=0550", initiatorType: "fetch", transferSize: 1, decodedBodySize: 2, duration: 8 },
          { name: "http://127.0.0.1:3101/storefront/ahmed-shop", initiatorType: "navigation", transferSize: 1, decodedBodySize: 2, duration: 7 },
          { name: "http://127.0.0.1:3101/x", initiatorType: "Weird Type!", transferSize: 1, decodedBodySize: 2, duration: 6 },
        ],
      }),
    );
    expect(result.slowResources).toEqual([
      { name: "/_next/static/chunks/a.js", ms: 9 },
      { name: "other:fetch", ms: 8 },
      { name: "other:navigation", ms: 7 },
    ]);
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/http|127\.0\.0\.1|secret|token|abc|frag|Ahmed|ahmed|dashboard|orders|4471|phone|0550|private|storefront/);
    const numbers = { ...result } as Record<string, unknown>;
    delete numbers.slowResources;
    for (const key of Object.keys(numbers)) expect((ALL_KEYS as readonly string[]).includes(key)).toBe(true);
    for (const value of Object.values(numbers)) expect(Number.isInteger(value)).toBe(true);
  });

  it("lists at most the 3 slowest resources, longest first, and cuts a long path", () => {
    const longPath = `/_next/static/chunks/${"x".repeat(300)}.js`;
    const result = buildUiTiming(
      fakePerformance({
        resource: [
          { name: "http://h/_next/a.js", initiatorType: "script", duration: 10 },
          { name: `http://h${longPath}`, initiatorType: "script", duration: 5000 },
          { name: "http://h/_next/c.js", initiatorType: "script", duration: 30 },
          { name: "http://h/_next/d.js", initiatorType: "script", duration: 20 },
          { name: "http://h/_next/e.js", initiatorType: "script", duration: 0 },
          { name: "http://h/_next/f.js", initiatorType: "script", duration: Number.NaN },
          { name: "http://h/_next/g.js", initiatorType: "script", duration: 1e15 },
        ],
      }),
    );
    expect(result.slowResources).toHaveLength(3);
    expect(result.slowResources?.map((item) => item.ms)).toEqual([UI_TIMING_MAX_MS, 5000, 30]);
    expect(result.slowResources?.[1]?.name).toBe(longPath.slice(0, UI_TIMING_SLOW_NAME_MAX));
    expect(UI_TIMING_SLOW_NAME_MAX).toBe(120);
  });

  it("leaves slowResources out when no resource has a usable duration", () => {
    const result = buildUiTiming(fakePerformance({ resource: [{ name: "http://h/_next/a.js", initiatorType: "script" }] }));
    expect("slowResources" in result).toBe(false);
  });

  it("takes the largest-contentful-paint only from a finite positive number", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect("largestContentfulPaintMs" in buildUiTiming(fakePerformance({}), { largestContentfulPaintMs: bad })).toBe(false);
    }
    expect(buildUiTiming(fakePerformance({}), { largestContentfulPaintMs: 1e12 }).largestContentfulPaintMs).toBe(UI_TIMING_MAX_MS);
  });

  it("omits what the browser did not report instead of writing a zero", () => {
    expect(buildUiTiming(fakePerformance({}))).toEqual({
      beaconMs: 27_124,
      scriptCount: 0,
      scriptTransferBytes: 0,
      scriptDecodedBytes: 0,
      resourceCount: 0,
      resourceTransferBytes: 0,
    });
    // A milestone still at zero has not happened yet.
    const early = buildUiTiming(
      fakePerformance({ navigation: [{ responseStart: 5, responseEnd: 6, domContentLoadedEventEnd: 0, loadEventEnd: 0 }] }),
    );
    expect(early.responseStartMs).toBe(5);
    expect("domContentLoadedEventEndMs" in early).toBe(false);
    expect("loadEventEndMs" in early).toBe(false);
    expect("firstContentfulPaintMs" in early).toBe(false);
  });

  it("works with a performance object that lacks parts of the API", () => {
    expect(buildUiTiming(undefined)).toEqual({});
    expect(buildUiTiming(null)).toEqual({});
    expect(buildUiTiming({})).toEqual({});
    expect(buildUiTiming({ now: () => 40.2 })).toEqual({ beaconMs: 40 });
    expect(buildUiTiming({ getEntriesByType: () => "not-a-list" })).toEqual({});
    expect(buildUiTiming({ getEntriesByType: () => [null, 7, "x"], now: () => "late" })).toEqual({
      scriptCount: 0,
      scriptTransferBytes: 0,
      scriptDecodedBytes: 0,
      resourceCount: 3,
      resourceTransferBytes: 0,
    });
  });

  it("keeps the other numbers when one part of the API throws", () => {
    const result = buildUiTiming(
      fakePerformance({
        navigation: new Error("no navigation"),
        paint: [{ name: "first-contentful-paint", startTime: 700 }],
        resource: new Error("no resources"),
      }),
    );
    expect(result).toEqual({ firstContentfulPaintMs: 700, beaconMs: 27_124 });
    expect(
      buildUiTiming({
        now: () => {
          throw new Error("no clock");
        },
        getEntriesByType: () => [],
      }),
    ).toEqual({ scriptCount: 0, scriptTransferBytes: 0, scriptDecodedBytes: 0, resourceCount: 0, resourceTransferBytes: 0 });
  });

  it("clamps absurd values to the range and drops anything that is not a finite number", () => {
    const result = buildUiTiming(
      fakePerformance(
        {
          navigation: [
            { responseStart: 1e15, responseEnd: Number.POSITIVE_INFINITY, domContentLoadedEventEnd: -5, loadEventEnd: "9" },
          ],
          paint: [{ name: "first-contentful-paint", startTime: Number.NaN }],
          resource: [
            { name: "a.js", initiatorType: "script", transferSize: 1e15, decodedBodySize: Number.NaN },
            { name: "b.js", initiatorType: "script", transferSize: -4, decodedBodySize: "5" },
          ],
        },
        1e12,
      ),
    );
    expect(result).toEqual({
      responseStartMs: UI_TIMING_MAX_MS,
      beaconMs: UI_TIMING_MAX_MS,
      scriptCount: 2,
      scriptTransferBytes: UI_TIMING_MAX_BYTES,
      scriptDecodedBytes: 0,
      resourceCount: 2,
      resourceTransferBytes: UI_TIMING_MAX_BYTES,
    });
  });

  it("counts a preloaded script file but not a style sheet or a data request", () => {
    const result = buildUiTiming(
      fakePerformance({
        resource: [
          { name: "http://127.0.0.1:1/_next/static/a.js?dpl=1", initiatorType: "link", transferSize: 10, decodedBodySize: 20 },
          { name: "http://127.0.0.1:1/_next/static/b.mjs#frag", initiatorType: "other", transferSize: 10, decodedBodySize: 20 },
          { name: "http://127.0.0.1:1/_next/static/c.css", initiatorType: "link", transferSize: 10, decodedBodySize: 20 },
          { name: "http://127.0.0.1:1/api/data.js", initiatorType: "fetch", transferSize: 10, decodedBodySize: 20 },
          { initiatorType: "script", transferSize: 10, decodedBodySize: 20 },
        ],
      }),
    );
    expect(result.scriptCount).toBe(3);
    expect(result.resourceCount).toBe(5);
  });

  it("caps the counts", () => {
    const resource = new Array(UI_TIMING_MAX_COUNT + 5).fill({ initiatorType: "script" });
    const result = buildUiTiming(fakePerformance({ resource }));
    expect(result.scriptCount).toBe(UI_TIMING_MAX_COUNT);
    expect(result.resourceCount).toBe(UI_TIMING_MAX_COUNT);
  });
});

describe("readLargestContentfulPaint", () => {
  type Callback = (list: { getEntries(): Array<{ startTime: number }> }) => void;
  const timers = (): { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (id: unknown) => void } => ({
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  });

  function windowWith(options: { supported?: string[]; first?: number[]; pending?: number[]; throwOnObserve?: boolean }) {
    const state = { observed: [] as unknown[], disconnected: 0 };
    class FakeObserver {
      static supportedEntryTypes = options.supported ?? ["largest-contentful-paint"];
      constructor(private readonly callback: Callback) {}
      observe(init: unknown) {
        if (options.throwOnObserve) throw new Error("bad type");
        state.observed.push(init);
        // Buffered entries arrive in a later task, as in a real browser.
        if (options.first) globalThis.setTimeout(() => this.callback({ getEntries: () => (options.first ?? []).map((startTime) => ({ startTime })) }), 0);
      }
      takeRecords() {
        return (options.pending ?? []).map((startTime) => ({ startTime }));
      }
      disconnect() {
        state.disconnected += 1;
      }
    }
    return { state, win: { PerformanceObserver: FakeObserver, ...timers() } };
  }

  it("reports the last buffered candidate and stops observing", async () => {
    const { state, win } = windowWith({ first: [13_000.4, 14_200.6] });
    expect(await readLargestContentfulPaint(win)).toBe(14_201);
    expect(state.observed).toEqual([{ type: "largest-contentful-paint", buffered: true }]);
    expect(state.disconnected).toBe(1);
  });

  it("also takes a candidate that was still queued when the wait ended", async () => {
    const { win } = windowWith({ first: [100], pending: [250.2] });
    expect(await readLargestContentfulPaint(win)).toBe(250);
  });

  it("answers undefined, without waiting, when the browser cannot report it", async () => {
    expect(await readLargestContentfulPaint(windowWith({ supported: ["paint"] }).win)).toBeUndefined();
    expect(await readLargestContentfulPaint({})).toBeUndefined();
    expect(await readLargestContentfulPaint(undefined)).toBeUndefined();
    expect(await readLargestContentfulPaint(windowWith({ throwOnObserve: true }).win)).toBeUndefined();
    expect(await readLargestContentfulPaint(windowWith({}).win)).toBeUndefined();
    expect(await readLargestContentfulPaint(windowWith({ first: [0, Number.NaN, -3] }).win)).toBeUndefined();
  });
});
