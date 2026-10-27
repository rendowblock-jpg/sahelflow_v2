import { describe, expect, it } from "vitest";

import { parseUiTimingBody } from "@/lib/runtime/ui-timing-schema";
import {
  UI_TIMING_BODY_MAX_BYTES,
  UI_TIMING_BYTES_KEYS,
  UI_TIMING_COUNT_KEYS,
  UI_TIMING_MAX_BYTES,
  UI_TIMING_MAX_COUNT,
  UI_TIMING_MAX_MS,
  UI_TIMING_MS_KEYS,
  buildUiTiming,
} from "@/lib/runtime/ui-timing";

const SLOW = { name: "/_next/static/chunks/main-app.js", ms: 12_001 };

const body = (value: unknown) => JSON.stringify(value);

describe("parseUiTimingBody", () => {
  it("accepts the timing object and returns only whole numbers", () => {
    expect(
      parseUiTimingBody(body({ timing: { responseStartMs: 812.4, beaconMs: 27_000, scriptCount: 41, scriptTransferBytes: 1_530_000 } })),
    ).toEqual({ responseStartMs: 812, beaconMs: 27_000, scriptCount: 41, scriptTransferBytes: 1_530_000 });
  });

  it("accepts exactly what the browser side builds", () => {
    const built = buildUiTiming({
      now: () => 27_123.7,
      getEntriesByType: (type: string) =>
        type === "navigation"
          ? [{ responseStart: 800, responseEnd: 9000, domInteractive: 6000, domContentLoadedEventEnd: 15_100, loadEventEnd: 26_000 }]
          : type === "paint"
            ? [{ name: "first-contentful-paint", startTime: 14_000 }]
            : [{ name: "http://127.0.0.1:1/_next/x.js?v=2", initiatorType: "script", transferSize: 10, decodedBodySize: 20, duration: 4200.4 }],
    }, { largestContentfulPaintMs: 21_000 });
    expect(built.slowResources).toEqual([{ name: "/_next/x.js", ms: 4200 }]);
    expect(built.domInteractiveMs).toBe(6000);
    expect(built.largestContentfulPaintMs).toBe(21_000);
    expect(parseUiTimingBody(body({ timing: built }))).toEqual(built);
  });

  it("accepts the new milestones, the all-resource byte total and the slowest resources", () => {
    expect(
      parseUiTimingBody(
        body({ timing: { domInteractiveMs: 6100.4, largestContentfulPaintMs: 20_000, resourceTransferBytes: 2_000_000, slowResources: [SLOW, { name: "other:fetch", ms: 3.6 }] } }),
      ),
    ).toEqual({
      domInteractiveMs: 6100,
      largestContentfulPaintMs: 20_000,
      resourceTransferBytes: 2_000_000,
      slowResources: [SLOW, { name: "other:fetch", ms: 4 }],
    });
  });

  it("keeps the other numbers and drops slowResources when it is more than 3, not a list, empty or holds nothing valid", () => {
    const four = [SLOW, SLOW, SLOW, SLOW];
    for (const slowResources of [four, "x", {}, [], null, [{ name: 5, ms: 1 }], [{ name: "/a.js" }]]) {
      expect(parseUiTimingBody(body({ timing: { beaconMs: 9, slowResources } }))).toEqual({ beaconMs: 9 });
    }
  });

  it("drops a slow-resource entry that has an extra key, a long name or a name that is not a plain path", () => {
    const bad = [
      { name: "/a.js", ms: 1, url: "http://127.0.0.1/a.js" },
      { name: `/${"x".repeat(120)}`, ms: 1 },
      { name: "http://127.0.0.1:3101/_next/a.js", ms: 1 },
      { name: "/_next/a.js?token=abc", ms: 1 },
      { name: "/_next/a.js#frag", ms: 1 },
      { name: "/a b.js", ms: 1 },
      { name: "", ms: 1 },
      null,
      "x",
    ];
    expect(parseUiTimingBody(body({ timing: { beaconMs: 9, slowResources: [...bad.slice(0, 3)] } }))).toEqual({ beaconMs: 9 });
    expect(parseUiTimingBody(body({ timing: { beaconMs: 9, slowResources: [bad[3], bad[4], bad[5]] } }))).toEqual({ beaconMs: 9 });
    expect(parseUiTimingBody(body({ timing: { beaconMs: 9, slowResources: [bad[6], bad[7], bad[8]] } }))).toEqual({ beaconMs: 9 });
    // A good entry beside bad ones is kept; a name of exactly 120 characters is allowed.
    const exact = { name: `/${"y".repeat(119)}`, ms: 2 };
    expect(parseUiTimingBody(body({ timing: { slowResources: [bad[0], SLOW, exact] } }))).toEqual({ slowResources: [SLOW, exact] });
    expect(parseUiTimingBody(body({ timing: { slowResources: [{ name: "/_next/a.js", ms: 1e15 }, { name: "/_next/b.js", ms: -2 }] } }))).toEqual({
      slowResources: [{ name: "/_next/a.js", ms: UI_TIMING_MAX_MS }, { name: "/_next/b.js", ms: 0 }],
    });
  });

  it("keeps the largest possible body under the size the route is willing to read", () => {
    const timing: Record<string, unknown> = {
      slowResources: [1, 2, 3].map(() => ({ name: `/${"a".repeat(119)}`, ms: UI_TIMING_MAX_MS })),
    };
    for (const key of UI_TIMING_MS_KEYS) timing[key] = UI_TIMING_MAX_MS;
    for (const key of UI_TIMING_COUNT_KEYS) timing[key] = UI_TIMING_MAX_COUNT;
    for (const key of UI_TIMING_BYTES_KEYS) timing[key] = UI_TIMING_MAX_BYTES;
    const text = body({ timing });
    expect(text.length).toBeLessThan(UI_TIMING_BODY_MAX_BYTES);
    expect(parseUiTimingBody(text)).toEqual(timing);
  });

  it("clamps each number to its range and drops one that is not a finite number", () => {
    expect(
      parseUiTimingBody(
        body({
          timing: {
            responseStartMs: 1e15,
            responseEndMs: -3,
            beaconMs: null,
            loadEventEndMs: "9",
            firstContentfulPaintMs: [1],
            scriptCount: 1e9,
            resourceCount: 7,
            scriptTransferBytes: 1e15,
            scriptDecodedBytes: { n: 1 },
          },
        }),
      ),
    ).toEqual({
      responseStartMs: UI_TIMING_MAX_MS,
      responseEndMs: 0,
      scriptCount: UI_TIMING_MAX_COUNT,
      resourceCount: 7,
      scriptTransferBytes: UI_TIMING_MAX_BYTES,
    });
  });

  it("rejects a timing object with a key it does not know, and unknown keys beside it", () => {
    expect(parseUiTimingBody(body({ timing: { beaconMs: 5, pageUrl: "http://127.0.0.1/x" } }))).toBeNull();
    expect(parseUiTimingBody(body({ timing: { beaconMs: 5 }, cookie: "x" }))).toBeNull();
    expect(parseUiTimingBody('{"timing":{"__proto__":{"beaconMs":5}}}')).toBeNull();
    expect(parseUiTimingBody('{"__proto__":{"timing":{"beaconMs":5}}}')).toBeNull();
    expect(({} as Record<string, unknown>).beaconMs).toBeUndefined();
  });

  it("returns null for anything that is not a timing body", () => {
    for (const text of ["", "not json", "null", "[]", "5", '"x"', "{}", '{"timing":null}', '{"timing":[]}', '{"timing":"x"}', '{"timing":{}}', '{"timing":{"beaconMs":"x"}}']) {
      expect(parseUiTimingBody(text)).toBeNull();
    }
  });
});
