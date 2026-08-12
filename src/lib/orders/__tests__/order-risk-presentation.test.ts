import { describe, expect, it } from "vitest";

import {
  getOrderRiskFactorPresentation,
  getOrderRiskRuleLabelKey,
} from "../order-risk-presentation";
import type { RiskFactor } from "@/lib/risk-engine/types";

function factor(overrides: Partial<RiskFactor>): RiskFactor {
  return {
    id: "generic",
    labelKey: "risk.factors.generic",
    value: 0,
    points: 0,
    direction: "risk",
    explanation: "engine-only explanation",
    ...overrides,
  };
}

describe("Orders risk presentation", () => {
  it("turns raw factor values into localized presentation parameters", () => {
    expect(
      getOrderRiskFactorPresentation(
        factor({ id: "customer_return_rate", value: 0.423 }),
      ),
    ).toEqual({
      key: "orders.workspace.risk.factor.customerReturnRate",
      params: { rate: 42 },
    });

    expect(
      getOrderRiskFactorPresentation(
        factor({ id: "order_frequency", value: 3.25, points: 10 }),
      ),
    ).toEqual({
      key: "orders.workspace.risk.factor.orderFrequency",
      params: { hours: "3.3" },
    });
  });

  it("keeps detected contact issues visible when contact weighting is disabled", () => {
    expect(
      getOrderRiskFactorPresentation(
        factor({ id: "contact_quality", value: 25, points: 0 }),
      ),
    ).toEqual({
      key: "orders.workspace.risk.factor.contactRisk",
      params: { points: 0 },
    });

    expect(
      getOrderRiskFactorPresentation(
        factor({ id: "contact_quality", value: 0, points: 0 }),
      ),
    ).toEqual({
      key: "orders.workspace.risk.factor.contactClear",
      params: {},
    });
  });

  it("keeps protective fallback copy free of engine explanation text", () => {
    expect(
      getOrderRiskFactorPresentation(
        factor({ points: -7, direction: "protective" }),
      ),
    ).toEqual({
      key: "orders.workspace.risk.factor.genericProtective",
      params: { points: 7 },
    });
  });

  it("maps only known rule ids to presentation labels", () => {
    expect(getOrderRiskRuleLabelKey("blacklist_hold")).toBe(
      "risk.rules.blacklistHold",
    );
    expect(getOrderRiskRuleLabelKey("auto_blacklist")).toBe(
      "orders.workspace.risk.rule.autoBlacklist",
    );
    expect(getOrderRiskRuleLabelKey("unknown_rule")).toBeUndefined();
  });
});
