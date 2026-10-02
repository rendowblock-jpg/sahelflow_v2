import type { RiskAction, RiskFactor } from "@/lib/risk-engine/types";

export interface OrderRiskFactorPresentation {
  key: string;
  params: Record<string, string | number>;
}

export function getOrderRiskFactorPresentation(
  factor: RiskFactor,
): OrderRiskFactorPresentation {
  switch (factor.id) {
    case "customer_return_rate":
      return {
        key: "orders.workspace.risk.factor.customerReturnRate",
        params: { rate: Math.round(factor.value * 100) },
      };
    case "customer_loyalty":
      return {
        key: "orders.workspace.risk.factor.customerLoyalty",
        params: { rate: Math.round(factor.value * 100) },
      };
    case "wilaya_risk":
      return {
        key: "orders.workspace.risk.factor.wilayaRisk",
        params: { level: factor.value },
      };
    case "order_value":
      return factor.points > 0
        ? {
            key: "orders.workspace.risk.factor.orderValueRisk",
            params: { points: factor.points },
          }
        : {
            key: "orders.workspace.risk.factor.orderValueClear",
            params: {},
          };
    case "contact_quality":
      return factor.value > 0
        ? {
            key: "orders.workspace.risk.factor.contactRisk",
            params: { points: factor.points },
          }
        : {
            key: "orders.workspace.risk.factor.contactClear",
            params: {},
          };
    case "new_customer":
      return {
        key: "orders.workspace.risk.factor.newCustomer",
        params: {},
      };
    case "order_frequency":
      return {
        key: "orders.workspace.risk.factor.orderFrequency",
        params: { hours: factor.value.toFixed(1) },
      };
    default:
      return factor.direction === "protective" || factor.points < 0
        ? {
            key: "orders.workspace.risk.factor.genericProtective",
            params: { points: Math.abs(factor.points) },
          }
        : {
            key: "orders.workspace.risk.factor.genericRisk",
            params: { points: Math.abs(factor.points) },
          };
  }
}

const KNOWN_RULE_LABEL_KEYS: Readonly<Record<string, string>> = {
  blacklist_hold: "risk.rules.blacklistHold",
  new_customer_high_value: "risk.rules.newCustomerHighValue",
  high_return_rate_customer: "risk.rules.highReturnRate",
  very_high_value_order: "risk.rules.veryHighValue",
  high_risk_wilaya: "risk.rules.highRiskWilaya",
  auto_blacklist: "orders.workspace.risk.rule.autoBlacklist",
};

export function getOrderRiskRuleLabelKey(ruleId: string): string | undefined {
  return KNOWN_RULE_LABEL_KEYS[ruleId];
}

const RISK_ACTIONS = new Set<string>([
  "auto_confirm",
  "standard",
  "call_first",
  "review",
  "hold",
  "blacklisted",
]);

/** Copy key for an engine action. A missing or unknown action must not render as `risk.action.undefined`. */
export function riskActionCopyKey(action: RiskAction | string | null | undefined): string {
  if (action && RISK_ACTIONS.has(action)) return `risk.action.${action}`;
  return "risk.action.unknown";
}

/** A stored rule label that is not in the dictionaries falls back instead of showing the raw key. */
export function riskRuleCopyKey(labelKey: string, translated: string): string {
  return translated === labelKey ? "risk.rules.unlisted" : labelKey;
}
