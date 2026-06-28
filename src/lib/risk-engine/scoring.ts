/**
 * Risk scoring engine — computes risk factors and aggregates them into a score.
 *
 * This is the PURE computational core of the risk engine. It takes a
 * RiskAssessmentInput + RiskEngineConfig and returns a RiskAssessment.
 * No DB access, no side effects — fully deterministic and unit-testable.
 *
 * Factor design principles:
 *   - Each factor is INDEPENDENT (no double-counting signals)
 *   - Points are on a 0-100 scale (so the final score is interpretable)
 *   - Protective factors (loyal customer, good history) give NEGATIVE points
 *   - Weights multiply the category's contribution (0 = off, 2 = double)
 *   - The final score is clamped to 0-100
 *
 * Confidence model:
 *   - New customer (0 orders): confidence 0.3 (we're guessing)
 *   - 1-3 orders: confidence 0.6 (some data)
 *   - 4+ orders: confidence 0.9 (strong signal)
 *   - Blacklist override: confidence 1.0 (certain)
 */
import type {
  RiskAssessment,
  RiskAssessmentInput,
  RiskEngineConfig,
  RiskFactor,
  RiskLevel,
  RiskAction,
} from "./types";

/** Algerian mobile phone regex — 0X XX XX XX XX or 0XXXXXXXXX (10 digits, starts with 0[5-7]). */
const DZ_MOBILE_REGEX = /^0[5-7]\d{8}$/;

/** Check if a phone number is a valid Algerian mobile. */
export function isValidDzPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s.-]/g, "");
  return DZ_MOBILE_REGEX.test(cleaned);
}

/** Compute the customer's return rate (returned + refused) / total non-draft orders. */
function computeReturnRate(history: NonNullable<RiskAssessmentInput["customerHistory"]>): number {
  const completedOrders =
    history.deliveredCount + history.returnedCount + history.refusedCount;
  if (completedOrders === 0) return 0;
  return (history.returnedCount + history.refusedCount) / completedOrders;
}

/** Compute the customer's confirmation rate (delivered) / (delivered + returned + refused). */
function computeConfirmationRate(history: NonNullable<RiskAssessmentInput["customerHistory"]>): number {
  const completedOrders =
    history.deliveredCount + history.returnedCount + history.refusedCount;
  if (completedOrders === 0) return 0;
  return history.deliveredCount / completedOrders;
}

// ── Factor computation functions ─────────────────────────────────────────────

/** Factor: customer return rate — the strongest single signal. */
function factorCustomerReturnRate(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor | null {
  if (!input.customerHistory || input.customerHistory.totalOrders === 0) return null;
  const returnRate = computeReturnRate(input.customerHistory);
  // 0% returns = 0 points; 50%+ returns = 40 points (scaled by weight)
  const points = Math.round(Math.min(returnRate, 1) * 80 * weight);
  return {
    id: "customer_return_rate",
    labelKey: "risk.factors.customerReturnRate",
    value: returnRate,
    points,
    direction: points > 0 ? "risk" : "protective",
    explanation: `${(returnRate * 100).toFixed(0)}% return rate (${input.customerHistory.returnedCount + input.customerHistory.refusedCount}/${input.customerHistory.deliveredCount + input.customerHistory.returnedCount + input.customerHistory.refusedCount} orders returned)`,
  };
}

/** Factor: customer loyalty — protective factor for repeat customers with good history. */
function factorCustomerLoyalty(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor | null {
  if (!input.customerHistory || input.customerHistory.totalOrders < 2) return null;
  const confirmationRate = computeConfirmationRate(input.customerHistory);
  if (confirmationRate < 0.7) return null; // only protective if they confirm reliably
  // 100% confirmation with 5+ orders = -15 points (strong protective)
  const orderBonus = Math.min(input.customerHistory.totalOrders, 10) / 10;
  const points = -Math.round(15 * confirmationRate * orderBonus * weight);
  return {
    id: "customer_loyalty",
    labelKey: "risk.factors.customerLoyalty",
    value: confirmationRate,
    points,
    direction: "protective",
    explanation: `${input.customerHistory.totalOrders} orders, ${(confirmationRate * 100).toFixed(0)}% delivered — loyal customer`,
  };
}

/** Factor: wilaya risk — geographic signal from the WilayaRiskProfile table. */
function factorWilayaRisk(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor | null {
  if (!input.wilayaRisk) return null;
  const { riskLevel, returnRate } = input.wilayaRisk;
  // riskLevel 1-5 → 0-20 points; returnRate adds up to 15 more
  const levelPoints = (riskLevel - 1) * 5;
  const returnPoints = Math.round(returnRate * 30);
  const points = Math.round((levelPoints + returnPoints) * weight);
  return {
    id: "wilaya_risk",
    labelKey: "risk.factors.wilayaRisk",
    value: riskLevel,
    points,
    direction: points > 0 ? "risk" : "protective",
    explanation: `Wilaya risk level ${riskLevel}/5, ${(returnRate * 100).toFixed(0)}% historical return rate`,
  };
}

/** Factor: order value — high-value COD orders are riskier (more to lose on a return). */
function factorOrderValue(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor {
  const value = input.order.totalPrice;
  // 0-3000 DZD = 0 points; 3000-8000 = 5; 8000-15000 = 10; 15000+ = 15
  let points = 0;
  if (value >= 15000) points = 15;
  else if (value >= 8000) points = 10;
  else if (value >= 3000) points = 5;
  const weighted = Math.round(points * weight);
  return {
    id: "order_value",
    labelKey: "risk.factors.orderValue",
    value,
    points: weighted,
    direction: weighted > 0 ? "risk" : "protective",
    explanation: `${value.toLocaleString()} DZD COD — ${value >= 15000 ? "very high" : value >= 8000 ? "high" : value >= 3000 ? "medium" : "low"} value`,
  };
}

/** Factor: contact quality — phone validity + address completeness. */
function factorContactQuality(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor {
  let issues = 0;
  const problems: string[] = [];

  if (!isValidDzPhone(input.order.phone)) {
    issues += 15;
    problems.push("invalid phone");
  }

  const address = input.order.address?.trim() ?? "";
  if (address.length < 10) {
    issues += 10;
    problems.push("short/no address");
  }

  if (!input.order.commune) {
    issues += 5;
    problems.push("no commune");
  }

  const points = Math.round(issues * weight);
  return {
    id: "contact_quality",
    labelKey: "risk.factors.contactQuality",
    value: issues,
    points,
    direction: points > 0 ? "risk" : "protective",
    explanation: problems.length > 0 ? problems.join(", ") : "valid phone + complete address",
  };
}

/** Factor: new customer — first-time buyers are inherently riskier (no track record). */
function factorNewCustomer(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor | null {
  if (!input.customerHistory || input.customerHistory.totalOrders > 0) return null;
  const points = Math.round(20 * weight);
  return {
    id: "new_customer",
    labelKey: "risk.factors.newCustomer",
    value: 0,
    points,
    direction: "risk",
    explanation: "First order — no purchase history to evaluate",
  };
}

/** Factor: order frequency — multiple orders in a short window can indicate fraud. */
function factorOrderFrequency(
  input: RiskAssessmentInput,
  weight: number,
): RiskFactor | null {
  if (!input.customerHistory?.lastOrderDate) return null;
  const hoursSinceLastOrder =
    (input.order.createdAt.getTime() - input.customerHistory.lastOrderDate.getTime()) / (1000 * 60 * 60);
  // Less than 24h since last order = suspicious (unless they're a high-volume reseller)
  if (hoursSinceLastOrder > 24) return null;
  const points = Math.round(10 * weight);
  return {
    id: "order_frequency",
    labelKey: "risk.factors.orderFrequency",
    value: hoursSinceLastOrder,
    points,
    direction: "risk",
    explanation: `Only ${hoursSinceLastOrder.toFixed(1)}h since last order — possible duplicate/fraud`,
  };
}

// ── Confidence computation ───────────────────────────────────────────────────

function computeConfidence(input: RiskAssessmentInput): number {
  if (input.customerHistory?.isBlacklisted) return 1.0;
  const orderCount = input.customerHistory?.totalOrders ?? 0;
  if (orderCount === 0) return 0.3;
  if (orderCount <= 3) return 0.6;
  return 0.9;
}

// ── Level + action derivation ────────────────────────────────────────────────

export function scoreToLevel(score: number, config: RiskEngineConfig): RiskLevel {
  if (score < config.thresholds.low) return "low";
  if (score < config.thresholds.medium) return "medium";
  if (score < config.thresholds.high) return "high";
  return "critical";
}

export function levelToAction(level: RiskLevel, config: RiskEngineConfig): RiskAction {
  switch (level) {
    case "low":
      return config.autoActions.autoConfirmLow ? "auto_confirm" : "standard";
    case "medium":
      return "call_first";
    case "high":
      return "review";
    case "critical":
      return config.autoActions.autoHoldCritical ? "hold" : "review";
  }
}

// ── Main scoring function ────────────────────────────────────────────────────

/**
 * Compute the base risk assessment (before rules) from the input + config.
 * This is the PURE function — rules are applied separately in assessRisk().
 */
export function computeBaseScore(
  input: RiskAssessmentInput,
  config: RiskEngineConfig,
): { factors: RiskFactor[]; score: number; confidence: number } {
  const factors: RiskFactor[] = [];

  // Customer history factors (weighted)
  const chw = config.weights.customerHistory;
  if (chw > 0) {
    const f1 = factorCustomerReturnRate(input, chw); if (f1) factors.push(f1);
    const f2 = factorCustomerLoyalty(input, chw);    if (f2) factors.push(f2);
    const f3 = factorNewCustomer(input, chw);        if (f3) factors.push(f3);
    const f4 = factorOrderFrequency(input, chw);     if (f4) factors.push(f4);
  }

  // Geography (wilaya)
  const gw = config.weights.geography;
  if (gw > 0) {
    const f = factorWilayaRisk(input, gw); if (f) factors.push(f);
  }

  // Order value
  const ow = config.weights.orderValue;
  if (ow > 0) {
    factors.push(factorOrderValue(input, ow));
  }

  // Contact quality
  const cw = config.weights.contactQuality;
  if (cw > 0) {
    factors.push(factorContactQuality(input, cw));
  }

  // Sum points (clamp 0-100)
  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const confidence = computeConfidence(input);

  return { factors, score, confidence };
}

/**
 * The full risk assessment — base score + rule evaluation.
 *
 * Rules are evaluated in order. Each rule can:
 *   - set_score: override the score entirely
 *   - add_points: add/subtract points (re-clamped to 0-100)
 *   - set_level: override the level (and re-derive action)
 *   - set_action: override the action only
 */
export function assessRisk(
  input: RiskAssessmentInput,
  config: RiskEngineConfig,
  rules: Array<{ id: string; enabled: boolean; condition: import("./types").RiskRuleCondition; effect: import("./types").RiskRuleEffect }> = [],
): RiskAssessment {
  // 1. Compute base score + factors
  const { factors, score: baseScore, confidence } = computeBaseScore(input, config);

  let score = baseScore;
  let level = scoreToLevel(score, config);
  let action = levelToAction(level, config);
  const triggeredRules: string[] = [];

  // 2. Evaluate rules (blacklist check first — highest priority)
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!evaluateCondition(rule.condition, input, { score })) continue;

    triggeredRules.push(rule.id);

    switch (rule.effect.type) {
      case "set_score":
        score = Math.max(0, Math.min(100, rule.effect.value));
        level = scoreToLevel(score, config);
        action = levelToAction(level, config);
        break;
      case "add_points":
        score = Math.max(0, Math.min(100, score + rule.effect.value));
        level = scoreToLevel(score, config);
        action = levelToAction(level, config);
        break;
      case "set_level":
        level = rule.effect.level;
        action = levelToAction(level, config);
        break;
      case "set_action":
        action = rule.effect.action;
        break;
    }
  }

  // 3. Blacklist override (even if no rule, the config auto-flag handles it)
  if (input.customerHistory?.isBlacklisted && config.autoActions.autoFlagBlacklist) {
    action = "blacklisted";
    level = "critical";
    if (!triggeredRules.includes("blacklist_hold")) {
      triggeredRules.push("auto_blacklist");
    }
  }

  return {
    score,
    level,
    action,
    confidence,
    factors,
    ruleOverride: triggeredRules.length > 0,
    triggeredRules,
    assessedAt: new Date().toISOString(),
  };
}

/** Evaluate a single rule condition against the input. */
export function evaluateCondition(
  condition: import("./types").RiskRuleCondition,
  input: RiskAssessmentInput,
  _ctx: { score: number },
): boolean {
  const hist = input.customerHistory;
  switch (condition.type) {
    case "customer_return_rate_gte":
      if (!hist || hist.totalOrders === 0) return false;
      return computeReturnRate(hist) >= condition.value;
    case "order_value_gte":
      return input.order.totalPrice >= condition.value;
    case "wilaya_risk_level_gte":
      return (input.wilayaRisk?.riskLevel ?? 0) >= condition.value;
    case "customer_order_count_eq":
      return (hist?.totalOrders ?? 0) === condition.value;
    case "customer_is_blacklisted":
      return hist?.isBlacklisted ?? false;
    case "phone_invalid":
      return !isValidDzPhone(input.order.phone);
    case "order_source_eq":
      return input.order.source === condition.value;
  }
}
