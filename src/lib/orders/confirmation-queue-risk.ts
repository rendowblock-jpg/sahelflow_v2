import type { RiskAssessment, RiskFactor } from "@/lib/risk-engine/types";
import type {
  ConfirmationQueueRisk,
  ConfirmationQueueRiskReasonCode,
} from "@/types/workbench";

/**
 * Suspicious-order FLAG for a confirmation-queue row (flag-only: nothing is blocked).
 * Pure: maps an engine assessment to at most one small flag object.
 *
 * Rule: reasons come only from factors that really add risk
 * (customer_return_rate, order_frequency, contact_quality about the phone,
 * action "blacklisted"). A row is flagged when it has >= 1 reason AND
 * (engine level is not "low" OR a reason is repeat_order_24h / blacklisted).
 * The flag level is never below "medium". Phone-derived reasons are dropped
 * for viewers without contact access.
 */
const REASON_KEYS: Record<ConfirmationQueueRiskReasonCode, string> = {
  blacklisted: "confirmationQueue.risk.reason.blacklisted",
  previous_returns: "confirmationQueue.risk.reason.previousReturns",
  repeat_order_24h: "confirmationQueue.risk.reason.repeatOrder24h",
  weak_contact: "confirmationQueue.risk.reason.weakContact",
};
const REASON_ORDER: readonly ConfirmationQueueRiskReasonCode[] = [
  "blacklisted",
  "previous_returns",
  "repeat_order_24h",
  "weak_contact",
];
const FLAGGED_AT_ANY_LEVEL: ReadonlySet<ConfirmationQueueRiskReasonCode> =
  new Set(["blacklisted", "repeat_order_24h"]);

function addsRisk(factor: RiskFactor | undefined): factor is RiskFactor {
  return factor !== undefined && factor.direction === "risk" && factor.points > 0;
}

export function buildConfirmationQueueRisk(
  assessment: RiskAssessment,
  access: { contact: boolean },
): ConfirmationQueueRisk | undefined {
  const factor = (id: string) => assessment.factors.find((entry) => entry.id === id);
  const found = new Set<ConfirmationQueueRiskReasonCode>();
  if (assessment.action === "blacklisted") found.add("blacklisted");
  if (addsRisk(factor("customer_return_rate"))) found.add("previous_returns");
  if (addsRisk(factor("order_frequency"))) found.add("repeat_order_24h");
  const contact = factor("contact_quality");
  if (access.contact && addsRisk(contact) && /phone/i.test(contact.explanation)) {
    found.add("weak_contact");
  }
  const reasons = REASON_ORDER.filter((code) => found.has(code)).map((code) => ({
    code,
    key: REASON_KEYS[code],
  }));
  if (reasons.length === 0) return undefined;
  if (assessment.level === "low" && !reasons.some((r) => FLAGGED_AT_ANY_LEVEL.has(r.code))) {
    return undefined;
  }
  return { level: assessment.level === "low" ? "medium" : assessment.level, reasons };
}
