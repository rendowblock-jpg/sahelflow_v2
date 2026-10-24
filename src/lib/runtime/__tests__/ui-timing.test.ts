import { describe, expect, it } from "vitest";

import {
  UI_TIMING_BYTES_KEYS,
  UI_TIMING_COUNT_KEYS,
  UI_TIMING_MAX_BYTES,
  UI_TIMING_MAX_COUNT,
  UI_TIMING_MAX_MS,
  UI_TIMING_MS_KEYS,
  buildUiTiming,
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
          { name: "http://127.0.0.1:3101/_next/static/chunks/a.js?v=1", initiatorType: "script", transferSize: 1000, decodedBodySize: 4000 },
          { name: "http://127.0.0.1:3101/_next/static/chunks/b.js", initiatorType: "script", transferSize: 500.4, decodedBodySize: 2500 },
          { name: "http://127.0.0.1:3101/_next/static/css/site.css", initiatorType: "link", transferSize: 300, decodedBodySize: 900 },
          { name: "http://127.0.0.1:3101/api/x", initiatorType: "fetch", transferSize: 50, decodedBodySize: 80 },
        ],
      }),
    );
    expect(result).toEqual({
      responseStartMs: 812,
      responseEndMs: 9035,
      domContentLoadedEventEndMs: 15_101,
      loadEventEndMs: 26_001,
      firstContentfulPaintMs: 14_000,
      beaconMs: 27_124,
      scriptCount: 2,
      scriptTransferBytes: 1500,
      scriptDecodedBytes: 6500,
      resourceCount: 4,
    });
  });

  it("carries numbers only: no resource name, URL or text can appear in the result", () => {
    const result = buildUiTiming(
      fakePerformance({
        navigation: [{ ...NAVIGATION, name: "http://127.0.0.1:3101/dashboard?secret=1", title: "Ahmed shop" }],
        paint: [{ name: "first-contentful-paint", startTime: 100, detail: "private" }],
        resource: [{ name: "http://127.0.0.1:3101/_next/chunks/private.js", initiatorType: "script", transferSize: 1, decodedBodySize: 2 }],
      }),
    );
    expect(Object.keys(result).every((key) => (ALL_KEYS as readonly string[]).includes(key))).toBe(true);
    for (const value of Object.values(result)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/http|secret|private|Ahmed|dashboard|chunks/);
  });

  it("omits what the browser did not report instead of writing a zero", () => {
    expect(buildUiTiming(fakePerformance({}))).toEqual({
      beaconMs: 27_124,
      scriptCount: 0,
      scriptTransferBytes: 0,
      scriptDecodedBytes: 0,
      resourceCount: 0,
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
    ).toEqual({ scriptCount: 0, scriptTransferBytes: 0, scriptDecodedBytes: 0, resourceCount: 0 });
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
