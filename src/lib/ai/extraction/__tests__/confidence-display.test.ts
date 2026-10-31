import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { confidenceDisplay } from "../confidence-display";

describe("confidenceDisplay", () => {
  it("shows nothing for a value that was not measured", () => {
    for (const v of [null, undefined, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) expect(confidenceDisplay(v)).toEqual({ kind: "none" });
  });
  it("shows a measured value, zero included, clamped to 1, labelled only when self-reported", () => {
    expect(confidenceDisplay(0)).toEqual({ kind: "value", value: 0, selfReported: false });
    expect(confidenceDisplay(0.8, "rule")).toEqual({ kind: "value", value: 0.8, selfReported: false });
    expect(confidenceDisplay(0.9, "self-reported")).toEqual({ kind: "value", value: 0.9, selfReported: true });
    expect(confidenceDisplay(1.7)).toEqual({ kind: "value", value: 1, selfReported: false });
  });
  it("the analytics component renders every confidence through it", () => {
    const src = readFileSync(fileURLToPath(new URL("../../../../components/analytics/extraction-analytics.tsx", import.meta.url)), "utf8");
    expect(src).not.toMatch(/format\((?:method|day)\.avgConfidence\)/);
    expect((src.match(/<ConfidenceText/g) ?? []).length).toBe(2);
    expect(src).toContain("avgConfidence: number | null");
  });
});
