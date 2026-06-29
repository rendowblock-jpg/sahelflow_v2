/**
 * Risk Engine — Type definitions.
 *
 * The risk engine predicts the likelihood that a COD (Cash-on-Delivery) order
 * will be confirmed by the customer and successfully delivered, vs returned/refused.
 *
 * Architecture:
 *   1. RiskFactors — individual signals extracted from the order + customer history
 *   2. RiskScore — weighted aggregation of factors → 0-100 score + level + confidence
 *   3. RiskRules — configurable if-then rules that can override the score or trigger actions
 *   4. RiskAction — the engine's recommendation (auto-confirm, review, hold, cancel)
 *
 * The engine is DETERMINISTIC and AUDITABLE: every score includes a breakdown
 * of which factors contributed how many points, so the seller can understand
 * WHY an order was flagged. This is critical for trust — a black-box score
 * that says "high risk" with no explanation is useless.
 *
 * Goal: +85% conversion (orders confirmed) and confirmation rate by focusing
 * seller attention on high-confidence orders first and flagging risky ones
 * for review BEFORE shipping (which is when the cost of a return is incurred).
 */

/** Risk level — 4 tiers, each maps to a recommended action. */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/** The engine's recommended action for an order. */
export type RiskAction =
  | "auto_confirm"   // Low risk — confirm automatically, ship without calling
  | "standard"       // Medium-low — normal flow, optional call
  | "call_first"     // Medium-high — call to confirm before shipping
  | "review"         // High — manual review required before shipping
  | "hold"           // Critical — hold for manager decision, do not ship
  | "blacklisted";   // Customer is on the blacklist — do not ship

/** A single risk factor — one signal from the order/customer data. */
export interface RiskFactor {
  /** Machine-readable factor ID (e.g. "customer_return_rate") */
  id: string;
  /** i18n key for the human-readable label */
  labelKey: string;
  /** The raw value of the signal (e.g. 0.42 for a 42% return rate) */
  value: number;
  /** Points contributed to the risk score (0-100 scale, can be negative for protective factors) */
  points: number;
  /** Whether this factor INCREASES risk (positive points) or DECREASES it (negative, e.g. loyal customer) */
  direction: "risk" | "protective";
  /** Short explanation of how the points were derived (shown in the UI breakdown) */
  explanation: string;
}

/** The full risk assessment for an order. */
export interface RiskAssessment {
  /** Final risk score 0-100 (0 = very safe, 100 = very risky) */
  score: number;
  /** Risk level derived from the score via configurable thresholds */
  level: RiskLevel;
  /** The engine's recommended action */
  action: RiskAction;
  /** 0-1 — how much data the assessment is based on (0 = no history, 1 = rich history).
   * A first-time customer with no history gets a medium score but LOW confidence.
   * A repeat customer with 20 orders gets a confident score. */
  confidence: number;
  /** The individual factors that contributed to the score (for the UI breakdown) */
  factors: RiskFactor[];
  /** Whether any rule fired and overrode the base score */
  ruleOverride: boolean;
  /** IDs of rules that fired (empty if none) */
  triggeredRules: string[];
  /** ISO timestamp of assessment */
  assessedAt: string;
}

/** Configuration for the risk engine — stored in the Setting table (seller-tunable). */
export interface RiskEngineConfig {
  /** Weight multipliers for each factor category (0-2, default 1).
   * 0 = disable factor, 1 = normal weight, 2 = double weight. */
  weights: {
    customerHistory: number;   // return rate, order count, LTV
    geography: number;         // wilaya risk
    orderValue: number;        // COD amount (high value = more risk)
    contactQuality: number;    // phone validity, address completeness
    behavior: number;          // order frequency, duplicate detection
  };
  /** Score thresholds for each risk level (0-100). Must be ascending. */
  thresholds: {
    low: number;       // score < low → "low" level (default 25)
    medium: number;    // score < medium → "medium" level (default 50)
    high: number;      // score < high → "high" level (default 75)
    // score >= high → "critical" level
  };
  /** Enable/disable auto-actions */
  autoActions: {
    autoConfirmLow: boolean;      // auto-confirm orders scored "low"
    autoHoldCritical: boolean;    // auto-hold orders scored "critical"
    autoFlagBlacklist: boolean;   // auto-flag blacklisted customers
  };
  /** Customer return-rate threshold above which a customer is auto-blacklisted (0-1) */
  autoBlacklistReturnRate: number;
}

/** Default configuration — sensible for a typical Algerian COD seller. */
export const DEFAULT_RISK_CONFIG: RiskEngineConfig = {
  weights: {
    customerHistory: 1.0,
    geography: 1.0,
    orderValue: 0.8,
    contactQuality: 1.2,
    behavior: 1.0,
  },
  thresholds: {
    low: 25,
    medium: 50,
    high: 75,
  },
  autoActions: {
    autoConfirmLow: false,      // off by default — seller reviews first
    autoHoldCritical: true,
    autoFlagBlacklist: true,
  },
  autoBlacklistReturnRate: 0.50, // 50%+ return rate → auto-blacklist
};

/** Input for risk assessment — the order + the customer's history. */
export interface RiskAssessmentInput {
  /** The order being assessed */
  order: {
    totalPrice: number;
    wilaya: string;
    commune?: string | null;
    address?: string | null;
    phone: string;
    source: string;
    createdAt: Date;
  };
  /** The customer's order history (for repeat customers) */
  customerHistory?: {
    customerId: string;
    totalOrders: number;
    deliveredCount: number;
    returnedCount: number;
    refusedCount: number;
    cancelledCount: number;
    totalSpent: number;
    firstOrderDate: Date | null;
    lastOrderDate: Date | null;
    isBlacklisted: boolean;
  };
  /** Wilaya risk profile (from the WilayaRiskProfile table) */
  wilayaRisk?: {
    riskLevel: number;        // 1-5
    confirmationRate: number; // 0-1
    returnRate: number;       // 0-1
  } | null;
}

/** A risk rule — configurable if-then that can override the score or action. */
export interface RiskRule {
  id: string;
  /** i18n key for the rule description */
  labelKey: string;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Condition — evaluated against the RiskAssessmentInput */
  condition: RiskRuleCondition;
  /** Action to take when the condition is met */
  effect: RiskRuleEffect;
  /** How many times this rule has fired (for analytics) */
  triggerCount: number;
}

/** A rule condition — a simple DSL for common risk patterns. */
export type RiskRuleCondition =
  | { type: "customer_return_rate_gte"; value: number }  // 0-1
  | { type: "order_value_gte"; value: number }           // DZD
  | { type: "wilaya_risk_level_gte"; value: number }     // 1-5
  | { type: "customer_order_count_eq"; value: number }   // exact (0 = new customer)
  | { type: "customer_is_blacklisted" }
  | { type: "phone_invalid" }
  | { type: "order_source_eq"; value: string };

/** A rule effect — what happens when the rule fires. */
export type RiskRuleEffect =
  | { type: "set_score"; value: number }          // override the score
  | { type: "add_points"; value: number }         // add/subtract points
  | { type: "set_level"; level: RiskLevel }       // override the level
  | { type: "set_action"; action: RiskAction };   // override the action

/** Default rules — starter templates the seller can enable/disable. */
export const DEFAULT_RISK_RULES: Omit<RiskRule, "triggerCount">[] = [
  {
    id: "blacklist_hold",
    labelKey: "risk.rules.blacklistHold",
    enabled: true,
    condition: { type: "customer_is_blacklisted" },
    effect: { type: "set_action", action: "blacklisted" },
  },
  {
    id: "new_customer_high_value",
    labelKey: "risk.rules.newCustomerHighValue",
    enabled: true,
    condition: { type: "customer_order_count_eq", value: 0 },
    effect: { type: "add_points", value: 15 },
  },
  {
    id: "high_return_rate_customer",
    labelKey: "risk.rules.highReturnRate",
    enabled: true,
    condition: { type: "customer_return_rate_gte", value: 0.40 },
    effect: { type: "add_points", value: 25 },
  },
  {
    id: "very_high_value_order",
    labelKey: "risk.rules.veryHighValue",
    enabled: true,
    condition: { type: "order_value_gte", value: 15000 },
    effect: { type: "add_points", value: 10 },
  },
  {
    id: "high_risk_wilaya",
    labelKey: "risk.rules.highRiskWilaya",
    enabled: true,
    condition: { type: "wilaya_risk_level_gte", value: 4 },
    effect: { type: "add_points", value: 15 },
  },
];
