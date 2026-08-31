/**
 * Customer risk scale helpers (R3-c).
 *
 * SahelFlow currently has TWO risk vocabularies that must never be silently
 * merged:
 *
 *   1. The order risk engine (src/lib/risk-engine) — a 0-100 score with
 *      seller-configurable thresholds (low/medium/high) and four levels.
 *      It assesses ORDERS, not customers.
 *   2. The customer signals score (`Customer.riskScore`) — a small ~0-10
 *      index with fixed local thresholds (>= 6 high, >= 3 medium). It is the
 *      scale the customers workspace summary uses (`riskScore: { gte: 6 }`).
 *
 * This module is the single authority for the signals scale so the customer
 * detail page, its header badge, and future surfaces cannot drift apart. It
 * deliberately contains NO conversion between the two scales — an equivalence
 * would be false (the engine scores one order; the signals score tracks the
 * customer) and the reconciliation UI renders both with explicit labels.
 */
import type { RiskLevel } from "@/lib/risk-engine/types";

/** Signals tier — the customer.riskScore vocabulary (3 tiers, no critical). */
export type CustomerSignalsLevel = "low" | "medium" | "high";

/** Fixed thresholds of the ~0-10 customer signals index. */
export const CUSTOMER_SIGNALS_SCALE = {
  /** Nominal ceiling of the index. Values above it only saturate the meter. */
  max: 10,
  /** score >= medium → "medium". */
  mediumThreshold: 3,
  /** score >= high → "high". */
  highThreshold: 6,
} as const;

/** Derive the signals tier from a customer.riskScore value. */
export function getCustomerSignalsLevel(score: number): CustomerSignalsLevel {
  if (score >= CUSTOMER_SIGNALS_SCALE.highThreshold) return "high";
  if (score >= CUSTOMER_SIGNALS_SCALE.mediumThreshold) return "medium";
  return "low";
}

/** Map a signals tier to the same severity space as the engine (0-2). */
function signalsSeverity(level: CustomerSignalsLevel): number {
  return level === "high" ? 2 : level === "medium" ? 1 : 0;
}

/** Map an engine level to a severity ordinal (0-3). */
function engineSeverity(level: RiskLevel): number {
  return level === "critical" ? 3 : level === "high" ? 2 : level === "medium" ? 1 : 0;
}

/**
 * Do the two scales disagree? Engine "critical" collapses onto signals "high"
 * (both mean "do not ship without checking") so only genuine tier mismatches
 * trigger the subtle reconciliation note on the customer profile.
 */
export function signalsLevelsDisagree(
  engineLevel: RiskLevel,
  signalsLevel: CustomerSignalsLevel,
): boolean {
  const engineTier = engineSeverity(engineLevel) >= 2 ? 2 : engineSeverity(engineLevel);
  return engineTier !== signalsSeverity(signalsLevel);
}

/** Meter fill percentage for a 0-100 engine score (clamped). */
export function engineMeterPercent(score: number): number {
  return clampPercent(score);
}

/** Meter fill percentage for a ~0-10 signals score (clamped, never fake 0-100). */
export function signalsMeterPercent(score: number): number {
  return clampPercent((score / CUSTOMER_SIGNALS_SCALE.max) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
