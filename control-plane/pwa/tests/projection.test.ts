import { describe, expect, it } from "vitest";
import { FRESH_MS, freshness, OFFLINE_WINDOW_MS } from "../src/today/projection";

const now = 1_800_000_000_000; const min = 60_000;
describe("freshness", () => {
  it.each([
    [0, "fresh"], [15 * min, "fresh"], [15 * min + 1, "stale"], [60 * min, "stale"],
    [OFFLINE_WINDOW_MS, "stale"], [OFFLINE_WINDOW_MS + 1, "expired"], [-4 * min, "fresh"], [-6 * min, "stale"],
  ])("age %d ms -> %s", (age, want) => expect(freshness(now - age, now)).toBe(want));
  it("has the documented limits", () => { expect(FRESH_MS).toBe(15 * min); expect(OFFLINE_WINDOW_MS).toBe(24 * 60 * min); });
});
