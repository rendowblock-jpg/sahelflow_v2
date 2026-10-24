import { describe, expect, it } from "vitest";

import { parseUiTimingBody } from "@/lib/runtime/ui-timing-schema";
import { UI_TIMING_MAX_BYTES, UI_TIMING_MAX_COUNT, UI_TIMING_MAX_MS, buildUiTiming } from "@/lib/runtime/ui-timing";

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
          ? [{ responseStart: 800, responseEnd: 9000, domContentLoadedEventEnd: 15_100, loadEventEnd: 26_000 }]
          : type === "paint"
            ? [{ name: "first-contentful-paint", startTime: 14_000 }]
            : [{ name: "x.js", initiatorType: "script", transferSize: 10, decodedBodySize: 20 }],
    });
    expect(parseUiTimingBody(body({ timing: built }))).toEqual(built);
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
