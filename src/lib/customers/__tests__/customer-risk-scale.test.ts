import { describe, expect, it } from "vitest";

import {
  CUSTOMER_SIGNALS_SCALE,
  engineMeterPercent,
  getCustomerSignalsLevel,
  signalsLevelsDisagree,
  signalsMeterPercent,
} from "../customer-risk-scale";

describe("customer risk scale (R3-c reconciliation)", () => {
  it("pins the signals-scale constants the customers workspace relies on", () => {
    // customer-workbench.ts counts high-risk customers with riskScore gte 6 —
    // this constant must stay in lockstep with that projection.
    expect(CUSTOMER_SIGNALS_SCALE).toEqual({
      max: 10,
      mediumThreshold: 3,
      highThreshold: 6,
    });
  });

  it("derives the signals tier with the fixed local thresholds", () => {
    expect(getCustomerSignalsLevel(0)).toBe("low");
    expect(getCustomerSignalsLevel(2)).toBe("low");
    expect(getCustomerSignalsLevel(3)).toBe("medium");
    expect(getCustomerSignalsLevel(5)).toBe("medium");
    expect(getCustomerSignalsLevel(6)).toBe("high");
    expect(getCustomerSignalsLevel(8)).toBe("high");
    // Off-scale legacy/demo values still classify, never crash.
    expect(getCustomerSignalsLevel(78)).toBe("high");
  });

  it("keeps the two meters on their own scales (no fake 0-100 conversion)", () => {
    expect(engineMeterPercent(0)).toBe(0);
    expect(engineMeterPercent(50)).toBe(50);
    expect(engineMeterPercent(100)).toBe(100);
    expect(engineMeterPercent(140)).toBe(100);
    expect(engineMeterPercent(-5)).toBe(0);

    expect(signalsMeterPercent(0)).toBe(0);
    expect(signalsMeterPercent(3)).toBe(30);
    expect(signalsMeterPercent(6)).toBe(60);
    expect(signalsMeterPercent(10)).toBe(100);
    // A ~10-point index value must NOT render as a 0-100 percentage.
    expect(signalsMeterPercent(7)).not.toBe(7);
    // Over-scale values saturate instead of inventing precision.
    expect(signalsMeterPercent(78)).toBe(100);
  });

  it("flags disagreement only on genuine tier mismatches", () => {
    expect(signalsLevelsDisagree("low", "low")).toBe(false);
    expect(signalsLevelsDisagree("medium", "medium")).toBe(false);
    // Engine "critical" collapses onto signals "high" — same verdict.
    expect(signalsLevelsDisagree("critical", "high")).toBe(false);
    expect(signalsLevelsDisagree("high", "high")).toBe(false);

    expect(signalsLevelsDisagree("critical", "low")).toBe(true);
    expect(signalsLevelsDisagree("low", "high")).toBe(true);
    expect(signalsLevelsDisagree("medium", "low")).toBe(true);
    expect(signalsLevelsDisagree("low", "medium")).toBe(true);
  });
});
