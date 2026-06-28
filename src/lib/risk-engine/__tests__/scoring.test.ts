/**
 * Risk engine — scoring tests.
 *
 * Tests the PURE scoring engine (no DB access).
 * Covers:
 *   - Each individual factor computation
 *   - Weight application
 *   - Confidence model
 *   - Score-to-level + level-to-action mapping
 *   - Rule evaluation (all 7 condition types + 4 effect types)
 *   - Blacklist override
 *   - Edge cases (new customer, loyal customer, invalid phone, etc.)
 */
import { describe, it, expect } from "vitest";
import {
  computeBaseScore,
  assessRisk,
  scoreToLevel,
  levelToAction,
  isValidDzPhone,
  evaluateCondition,
} from "../scoring";
import {
  DEFAULT_RISK_CONFIG,
  type RiskAssessmentInput,
  type RiskEngineConfig,
} from "../types";

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RiskAssessmentInput> = {}): RiskAssessmentInput {
  return {
    order: {
      totalPrice: 3000,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche Mourad, Centre Ville",
      phone: "0555123456",
      source: "whatsapp",
      createdAt: new Date("2026-01-15"),
    },
    customerHistory: {
      customerId: "cust1",
      totalOrders: 5,
      deliveredCount: 4,
      returnedCount: 1,
      refusedCount: 0,
      cancelledCount: 0,
      totalSpent: 15000,
      firstOrderDate: new Date("2025-06-01"),
      lastOrderDate: new Date("2025-12-01"),
      isBlacklisted: false,
    },
    wilayaRisk: {
      riskLevel: 2,
      confirmationRate: 0.78,
      returnRate: 0.12,
    },
    ...overrides,
  };
}

const noHistoryInput: RiskAssessmentInput = {
  order: {
    totalPrice: 3000,
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche Mourad",
    phone: "0555123456",
    source: "whatsapp",
    createdAt: new Date("2026-01-15"),
  },
  // No customerHistory — new customer
  wilayaRisk: { riskLevel: 2, confirmationRate: 0.78, returnRate: 0.12 },
};

// ── Phone validation ─────────────────────────────────────────────────────────

describe("isValidDzPhone", () => {
  it("accepts valid Algerian mobile numbers", () => {
    expect(isValidDzPhone("0555123456")).toBe(true);
    expect(isValidDzPhone("0666123456")).toBe(true);
    expect(isValidDzPhone("0777123456")).toBe(true);
  });

  it("accepts numbers with spaces/dashes/dots", () => {
    expect(isValidDzPhone("0555 12 34 56")).toBe(true);
    expect(isValidDzPhone("0555-12-34-56")).toBe(true);
    expect(isValidDzPhone("0555.12.34.56")).toBe(true);
  });

  it("rejects invalid numbers", () => {
    expect(isValidDzPhone("1234567890")).toBe(false); // doesn't start with 0[5-7]
    expect(isValidDzPhone("0444123456")).toBe(false); // 04 is landline
    expect(isValidDzPhone("055512345")).toBe(false);  // too short (9 digits)
    expect(isValidDzPhone("05551234567")).toBe(false); // too long (11 digits)
    expect(isValidDzPhone("")).toBe(false);
    expect(isValidDzPhone("abc")).toBe(false);
  });
});

// ── Score → Level → Action mapping ───────────────────────────────────────────

describe("scoreToLevel", () => {
  it("maps scores to levels using config thresholds", () => {
    const config = DEFAULT_RISK_CONFIG;
    expect(scoreToLevel(0, config)).toBe("low");
    expect(scoreToLevel(24, config)).toBe("low");
    expect(scoreToLevel(25, config)).toBe("medium"); // exactly low threshold → medium
    expect(scoreToLevel(49, config)).toBe("medium");
    expect(scoreToLevel(50, config)).toBe("high");
    expect(scoreToLevel(74, config)).toBe("high");
    expect(scoreToLevel(75, config)).toBe("critical");
    expect(scoreToLevel(100, config)).toBe("critical");
  });

  it("respects custom thresholds", () => {
    const config: RiskEngineConfig = {
      ...DEFAULT_RISK_CONFIG,
      thresholds: { low: 10, medium: 30, high: 60 },
    };
    expect(scoreToLevel(5, config)).toBe("low");
    expect(scoreToLevel(15, config)).toBe("medium");
    expect(scoreToLevel(40, config)).toBe("high");
    expect(scoreToLevel(65, config)).toBe("critical");
  });
});

describe("levelToAction", () => {
  it("maps levels to default actions", () => {
    const config = DEFAULT_RISK_CONFIG;
    expect(levelToAction("low", config)).toBe("standard"); // autoConfirmLow is false
    expect(levelToAction("medium", config)).toBe("call_first");
    expect(levelToAction("high", config)).toBe("review");
    expect(levelToAction("critical", config)).toBe("hold"); // autoHoldCritical is true
  });

  it("returns auto_confirm when autoConfirmLow is enabled", () => {
    const config: RiskEngineConfig = {
      ...DEFAULT_RISK_CONFIG,
      autoActions: {
        ...DEFAULT_RISK_CONFIG.autoActions,
        autoConfirmLow: true,
      },
    };
    expect(levelToAction("low", config)).toBe("auto_confirm");
  });

  it("returns review for critical when autoHoldCritical is disabled", () => {
    const config: RiskEngineConfig = {
      ...DEFAULT_RISK_CONFIG,
      autoActions: {
        ...DEFAULT_RISK_CONFIG.autoActions,
        autoHoldCritical: false,
      },
    };
    expect(levelToAction("critical", config)).toBe("review");
  });
});

// ── Base score computation ───────────────────────────────────────────────────

describe("computeBaseScore", () => {
  it("returns a score between 0-100", () => {
    const { score } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns factors array with explanations", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(factors.length).toBeGreaterThan(0);
    for (const f of factors) {
      expect(f.id).toBeTruthy();
      expect(f.labelKey).toBeTruthy();
      expect(f.explanation).toBeTruthy();
      expect(["risk", "protective"]).toContain(f.direction);
    }
  });

  it("includes wilaya_risk factor when wilayaRisk is provided", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "wilaya_risk")).toBeDefined();
  });

  it("includes order_value factor", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "order_value")).toBeDefined();
  });

  it("includes contact_quality factor", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "contact_quality")).toBeDefined();
  });

  it("includes new_customer factor when no history", () => {
    const { factors } = computeBaseScore(noHistoryInput, DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "new_customer")).toBeDefined();
  });

  it("does NOT include new_customer when customer has orders", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "new_customer")).toBeUndefined();
  });

  it("includes customer_return_rate when history exists", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    const f = factors.find((f) => f.id === "customer_return_rate");
    expect(f).toBeDefined();
    expect(f!.value).toBe(0.2); // 1 returned / 5 completed (4 delivered + 1 returned)
  });

  it("includes customer_loyalty for reliable repeat customers", () => {
    const input = makeInput({
      customerHistory: {
        customerId: "cust1",
        totalOrders: 10,
        deliveredCount: 9,
        returnedCount: 1,
        refusedCount: 0,
        cancelledCount: 0,
        totalSpent: 30000,
        firstOrderDate: new Date("2025-01-01"),
        lastOrderDate: new Date("2025-12-01"),
        isBlacklisted: false,
      },
    });
    const { factors } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    const loyalty = factors.find((f) => f.id === "customer_loyalty");
    expect(loyalty).toBeDefined();
    expect(loyalty!.points).toBeLessThan(0); // protective factor = negative points
    expect(loyalty!.direction).toBe("protective");
  });

  it("does NOT include customer_loyalty when confirmation rate < 70%", () => {
    const input = makeInput({
      customerHistory: {
        customerId: "cust1",
        totalOrders: 10,
        deliveredCount: 5,
        returnedCount: 5,
        refusedCount: 0,
        cancelledCount: 0,
        totalSpent: 15000,
        firstOrderDate: new Date("2025-01-01"),
        lastOrderDate: new Date("2025-12-01"),
        isBlacklisted: false,
      },
    });
    const { factors } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "customer_loyalty")).toBeUndefined();
  });

  it("includes order_frequency when last order < 24h ago", () => {
    const input = makeInput({
      customerHistory: {
        customerId: "cust1",
        totalOrders: 3,
        deliveredCount: 3,
        returnedCount: 0,
        refusedCount: 0,
        cancelledCount: 0,
        totalSpent: 9000,
        firstOrderDate: new Date("2025-12-01"),
        lastOrderDate: new Date("2026-01-14T12:00:00"), // 12h before order
        isBlacklisted: false,
      },
    });
    const { factors } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    const freq = factors.find((f) => f.id === "order_frequency");
    expect(freq).toBeDefined();
    expect(freq!.points).toBeGreaterThan(0);
  });

  it("does NOT include order_frequency when last order > 24h ago", () => {
    const { factors } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "order_frequency")).toBeUndefined();
  });
});

// ── Weight application ───────────────────────────────────────────────────────

describe("weight application", () => {
  it("disables a factor category when weight is 0", () => {
    const config: RiskEngineConfig = {
      ...DEFAULT_RISK_CONFIG,
      weights: { ...DEFAULT_RISK_CONFIG.weights, geography: 0 },
    };
    const { factors } = computeBaseScore(makeInput(), config);
    expect(factors.find((f) => f.id === "wilaya_risk")).toBeUndefined();
  });

  it("doubles factor points when weight is 2", () => {
    const config1 = { ...DEFAULT_RISK_CONFIG, weights: { ...DEFAULT_RISK_CONFIG.weights, orderValue: 1 } };
    const config2 = { ...DEFAULT_RISK_CONFIG, weights: { ...DEFAULT_RISK_CONFIG.weights, orderValue: 2 } };
    const input = makeInput({ order: { ...makeInput().order, totalPrice: 20000 } });
    const { factors: f1 } = computeBaseScore(input, config1);
    const { factors: f2 } = computeBaseScore(input, config2);
    const v1 = f1.find((f) => f.id === "order_value")!.points;
    const v2 = f2.find((f) => f.id === "order_value")!.points;
    expect(v2).toBe(v1 * 2);
  });
});

// ── Confidence model ─────────────────────────────────────────────────────────

describe("confidence", () => {
  it("returns 0.3 for new customers (no history)", () => {
    const { confidence } = computeBaseScore(noHistoryInput, DEFAULT_RISK_CONFIG);
    expect(confidence).toBe(0.3);
  });

  it("returns 0.6 for customers with 1-3 orders", () => {
    const input = makeInput({
      customerHistory: {
        ...makeInput().customerHistory!,
        totalOrders: 2,
        deliveredCount: 2,
      },
    });
    const { confidence } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    expect(confidence).toBe(0.6);
  });

  it("returns 0.9 for customers with 4+ orders", () => {
    const { confidence } = computeBaseScore(makeInput(), DEFAULT_RISK_CONFIG);
    expect(confidence).toBe(0.9);
  });

  it("returns 1.0 for blacklisted customers", () => {
    const input = makeInput({
      customerHistory: { ...makeInput().customerHistory!, isBlacklisted: true },
    });
    const { confidence } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    expect(confidence).toBe(1.0);
  });
});

// ── Full assessRisk (with rules) ─────────────────────────────────────────────

describe("assessRisk", () => {
  it("returns a complete RiskAssessment object", () => {
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, []);
    expect(assessment).toHaveProperty("score");
    expect(assessment).toHaveProperty("level");
    expect(assessment).toHaveProperty("action");
    expect(assessment).toHaveProperty("confidence");
    expect(assessment).toHaveProperty("factors");
    expect(assessment).toHaveProperty("triggeredRules");
    expect(assessment).toHaveProperty("assessedAt");
    expect(typeof assessment.score).toBe("number");
    expect(typeof assessment.assessedAt).toBe("string");
  });

  it("does not trigger any rules when rules array is empty", () => {
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, []);
    expect(assessment.triggeredRules).toEqual([]);
    expect(assessment.ruleOverride).toBe(false);
  });

  it("respects rule order (later rules can override earlier ones)", () => {
    const rules = [
      { id: "r1", enabled: true, condition: { type: "customer_order_count_eq" as const, value: 5 }, effect: { type: "set_score" as const, value: 90 } },
      { id: "r2", enabled: true, condition: { type: "customer_order_count_eq" as const, value: 5 }, effect: { type: "set_score" as const, value: 10 } },
    ];
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(assessment.score).toBe(10); // r2 overrides r1
    expect(assessment.triggeredRules).toEqual(["r1", "r2"]);
  });

  it("skips disabled rules", () => {
    const rules = [
      { id: "r1", enabled: false, condition: { type: "customer_order_count_eq" as const, value: 5 }, effect: { type: "set_score" as const, value: 90 } },
    ];
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(assessment.triggeredRules).toEqual([]);
  });
});

// ── Rule conditions ──────────────────────────────────────────────────────────

describe("evaluateCondition", () => {
  const ctx = { score: 50 };

  it("customer_return_rate_gte", () => {
    const input = makeInput(); // 20% return rate
    expect(evaluateCondition({ type: "customer_return_rate_gte", value: 0.15 }, input, ctx)).toBe(true);
    expect(evaluateCondition({ type: "customer_return_rate_gte", value: 0.25 }, input, ctx)).toBe(false);
    expect(evaluateCondition({ type: "customer_return_rate_gte", value: 0.1 }, noHistoryInput, ctx)).toBe(false);
  });

  it("order_value_gte", () => {
    const input = makeInput({ order: { ...makeInput().order, totalPrice: 5000 } });
    expect(evaluateCondition({ type: "order_value_gte", value: 3000 }, input, ctx)).toBe(true);
    expect(evaluateCondition({ type: "order_value_gte", value: 6000 }, input, ctx)).toBe(false);
  });

  it("wilaya_risk_level_gte", () => {
    const input = makeInput({ wilayaRisk: { riskLevel: 4, confirmationRate: 0.6, returnRate: 0.2 } });
    expect(evaluateCondition({ type: "wilaya_risk_level_gte", value: 3 }, input, ctx)).toBe(true);
    expect(evaluateCondition({ type: "wilaya_risk_level_gte", value: 5 }, input, ctx)).toBe(false);
    expect(evaluateCondition({ type: "wilaya_risk_level_gte", value: 1 }, { ...noHistoryInput, wilayaRisk: null }, ctx)).toBe(false);
  });

  it("customer_order_count_eq", () => {
    expect(evaluateCondition({ type: "customer_order_count_eq", value: 5 }, makeInput(), ctx)).toBe(true);
    expect(evaluateCondition({ type: "customer_order_count_eq", value: 0 }, makeInput(), ctx)).toBe(false);
    expect(evaluateCondition({ type: "customer_order_count_eq", value: 0 }, noHistoryInput, ctx)).toBe(true);
  });

  it("customer_is_blacklisted", () => {
    expect(evaluateCondition({ type: "customer_is_blacklisted" }, makeInput(), ctx)).toBe(false);
    const blacklisted = makeInput({ customerHistory: { ...makeInput().customerHistory!, isBlacklisted: true } });
    expect(evaluateCondition({ type: "customer_is_blacklisted" }, blacklisted, ctx)).toBe(true);
    expect(evaluateCondition({ type: "customer_is_blacklisted" }, noHistoryInput, ctx)).toBe(false);
  });

  it("phone_invalid", () => {
    expect(evaluateCondition({ type: "phone_invalid" }, makeInput(), ctx)).toBe(false);
    const badPhone = makeInput({ order: { ...makeInput().order, phone: "12345" } });
    expect(evaluateCondition({ type: "phone_invalid" }, badPhone, ctx)).toBe(true);
  });

  it("order_source_eq", () => {
    expect(evaluateCondition({ type: "order_source_eq", value: "whatsapp" }, makeInput(), ctx)).toBe(true);
    expect(evaluateCondition({ type: "order_source_eq", value: "shopify" }, makeInput(), ctx)).toBe(false);
  });
});

// ── Rule effects ─────────────────────────────────────────────────────────────

describe("rule effects", () => {
  it("set_score overrides the score", () => {
    const rules = [{
      id: "set90", enabled: true,
      condition: { type: "customer_order_count_eq" as const, value: 5 },
      effect: { type: "set_score" as const, value: 90 },
    }];
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(assessment.score).toBe(90);
    expect(assessment.level).toBe("critical"); // 90 >= 75 threshold
  });

  it("add_points adds to the base score", () => {
    const base = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, []);
    const rules = [{
      id: "add20", enabled: true,
      condition: { type: "customer_order_count_eq" as const, value: 5 },
      effect: { type: "add_points" as const, value: 20 },
    }];
    const withRule = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(withRule.score).toBe(Math.min(100, base.score + 20));
  });

  it("add_points can subtract (negative value)", () => {
    const base = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, []);
    const rules = [{
      id: "sub20", enabled: true,
      condition: { type: "customer_order_count_eq" as const, value: 5 },
      effect: { type: "add_points" as const, value: -20 },
    }];
    const withRule = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(withRule.score).toBe(Math.max(0, base.score - 20));
  });

  it("set_level overrides the level", () => {
    const rules = [{
      id: "forceCritical", enabled: true,
      condition: { type: "customer_order_count_eq" as const, value: 5 },
      effect: { type: "set_level" as const, level: "critical" as const },
    }];
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(assessment.level).toBe("critical");
    expect(assessment.action).toBe("hold"); // critical → hold (autoHoldCritical=true)
  });

  it("set_action overrides the action", () => {
    const rules = [{
      id: "forceReview", enabled: true,
      condition: { type: "customer_order_count_eq" as const, value: 5 },
      effect: { type: "set_action" as const, action: "review" as const },
    }];
    const assessment = assessRisk(makeInput(), DEFAULT_RISK_CONFIG, rules);
    expect(assessment.action).toBe("review");
  });
});

// ── Blacklist override ───────────────────────────────────────────────────────

describe("blacklist override", () => {
  it("forces action=blacklisted when customer is blacklisted + autoFlagBlacklist is on", () => {
    const input = makeInput({
      customerHistory: { ...makeInput().customerHistory!, isBlacklisted: true },
    });
    const assessment = assessRisk(input, DEFAULT_RISK_CONFIG, []);
    expect(assessment.action).toBe("blacklisted");
    expect(assessment.level).toBe("critical");
    expect(assessment.triggeredRules).toContain("auto_blacklist");
  });

  it("does NOT override when autoFlagBlacklist is off", () => {
    const input = makeInput({
      customerHistory: { ...makeInput().customerHistory!, isBlacklisted: true },
    });
    const config: RiskEngineConfig = {
      ...DEFAULT_RISK_CONFIG,
      autoActions: { ...DEFAULT_RISK_CONFIG.autoActions, autoFlagBlacklist: false },
    };
    const assessment = assessRisk(input, config, []);
    expect(assessment.action).not.toBe("blacklisted");
  });

  it("blacklist rule fires before auto-blacklist check", () => {
    const input = makeInput({
      customerHistory: { ...makeInput().customerHistory!, isBlacklisted: true },
    });
    const rules = [{
      id: "blacklist_hold", enabled: true,
      condition: { type: "customer_is_blacklisted" as const },
      effect: { type: "set_action" as const, action: "blacklisted" as const },
    }];
    const assessment = assessRisk(input, DEFAULT_RISK_CONFIG, rules);
    expect(assessment.triggeredRules).toContain("blacklist_hold");
    expect(assessment.action).toBe("blacklisted");
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("clamps score to 0-100", () => {
    // Extreme input: high return rate + high value + bad phone
    const input: RiskAssessmentInput = {
      order: {
        totalPrice: 50000,
        wilaya: "Tamanrasset",
        commune: null,
        address: "x",
        phone: "invalid",
        source: "whatsapp",
        createdAt: new Date(),
      },
      customerHistory: {
        customerId: "c1",
        totalOrders: 10,
        deliveredCount: 2,
        returnedCount: 8,
        refusedCount: 0,
        cancelledCount: 0,
        totalSpent: 20000,
        firstOrderDate: new Date("2025-01-01"),
        lastOrderDate: new Date(),
        isBlacklisted: false,
      },
      wilayaRisk: { riskLevel: 5, confirmationRate: 0.5, returnRate: 0.28 },
    };
    const assessment = assessRisk(input, DEFAULT_RISK_CONFIG, []);
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(100);
  });

  it("handles null wilayaRisk gracefully", () => {
    const input = makeInput({ wilayaRisk: null });
    const { factors } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "wilaya_risk")).toBeUndefined();
  });

  it("handles missing customerHistory gracefully", () => {
    const { factors, confidence } = computeBaseScore(noHistoryInput, DEFAULT_RISK_CONFIG);
    expect(factors.find((f) => f.id === "customer_return_rate")).toBeUndefined();
    expect(factors.find((f) => f.id === "new_customer")).toBeDefined();
    expect(confidence).toBe(0.3);
  });

  it("handles empty address", () => {
    const input = makeInput({ order: { ...makeInput().order, address: "" } });
    const { factors } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    const contact = factors.find((f) => f.id === "contact_quality");
    expect(contact).toBeDefined();
    expect(contact!.points).toBeGreaterThan(0); // should have points for bad address
  });

  it("handles very low value order (0 DZD)", () => {
    const input = makeInput({ order: { ...makeInput().order, totalPrice: 0 } });
    const { factors } = computeBaseScore(input, DEFAULT_RISK_CONFIG);
    const value = factors.find((f) => f.id === "order_value");
    expect(value).toBeDefined();
    expect(value!.points).toBe(0); // 0 DZD = no risk points
  });
});
