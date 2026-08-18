import { describe, expect, it } from "vitest";

import { normalizeRiskConfig } from "../config-normalization";
import { DEFAULT_RISK_CONFIG } from "../types";

describe("normalizeRiskConfig", () => {
  it("preserves a valid current-schema config", () => {
    const current = {
      ...DEFAULT_RISK_CONFIG,
      weights: {
        ...DEFAULT_RISK_CONFIG.weights,
        customerHistory: 1.4,
        behavior: 0.6,
      },
      thresholds: { low: 18, medium: 44, high: 72 },
      autoActions: {
        autoConfirmLow: true,
        autoHoldCritical: false,
        autoFlagBlacklist: true,
      },
      autoBlacklistReturnRate: 0.62,
    };

    expect(normalizeRiskConfig(current)).toEqual(current);
  });

  it("maps the legacy rich-seed schema into the current runtime contract", () => {
    const legacy = {
      weights: {
        customerReturnRate: 1,
        customerLoyalty: 1,
        newCustomer: 1,
        orderFrequency: 0.7,
        wilayaRisk: 1.2,
        orderValue: 0.9,
        contactQuality: 1.1,
      },
      thresholds: { medium: 30, high: 60, critical: 80 },
      autoActions: {
        medium: "standard",
        high: "call_first",
        critical: "review",
      },
      autoBlacklistReturnRate: 0.8,
    };

    expect(normalizeRiskConfig(legacy)).toEqual({
      weights: {
        customerHistory: 1,
        geography: 1.2,
        orderValue: 0.9,
        contactQuality: 1.1,
        behavior: 0.7,
      },
      thresholds: { low: 30, medium: 60, high: 80 },
      autoActions: { ...DEFAULT_RISK_CONFIG.autoActions },
      autoBlacklistReturnRate: 0.8,
    });
  });

  it("deep-fills partial nested current settings instead of dropping defaults", () => {
    expect(
      normalizeRiskConfig({
        weights: { orderValue: 1.5 },
        thresholds: { low: 20 },
        autoActions: { autoConfirmLow: true },
      }),
    ).toEqual({
      weights: {
        ...DEFAULT_RISK_CONFIG.weights,
        orderValue: 1.5,
      },
      thresholds: {
        low: 20,
        medium: DEFAULT_RISK_CONFIG.thresholds.medium,
        high: DEFAULT_RISK_CONFIG.thresholds.high,
      },
      autoActions: {
        ...DEFAULT_RISK_CONFIG.autoActions,
        autoConfirmLow: true,
      },
      autoBlacklistReturnRate: DEFAULT_RISK_CONFIG.autoBlacklistReturnRate,
    });
  });

  it("falls back to safe defaults for invalid or non-ascending thresholds", () => {
    expect(
      normalizeRiskConfig({ thresholds: { low: 70, medium: 20, high: 10 } })
        .thresholds,
    ).toEqual(DEFAULT_RISK_CONFIG.thresholds);

    expect(
      normalizeRiskConfig({
        weights: { customerHistory: Number.NaN, geography: 9 },
        autoBlacklistReturnRate: -2,
      }),
    ).toMatchObject({
      weights: {
        customerHistory: DEFAULT_RISK_CONFIG.weights.customerHistory,
        geography: 2,
      },
      autoBlacklistReturnRate: 0,
    });
  });
});
