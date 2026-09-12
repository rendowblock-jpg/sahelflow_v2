import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
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
  /**
   * `RiskFactor.explanation` is engine-only English assembled in
   * `src/lib/risk-engine/scoring.ts` ("very high value", "loyal customer",
   * "possible duplicate/fraud", "First order — no purchase history to
   * evaluate"). It exists so the score stays auditable and deterministic, and
   * it is NOT seller copy: rendering it puts English risk reasoning in front of
   * Arabic and French sellers in a trilingual product.
   *
   * `getOrderRiskFactorPresentation` is the only sanctioned way to show a
   * factor. `order-form-dialog.tsx` rendered `f.explanation` directly until
   * this gate was added, while the orders detail surface routed correctly —
   * the sort of divergence only a mechanical check catches.
   */
  it("never renders the engine's English explanation in a seller surface", () => {
    const root = process.cwd();
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "__tests__") continue;
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          files.push(path);
        }
      }
    };
    walk(resolve(root, "src/app"));
    walk(resolve(root, "src/components"));

    const offenders: string[] = [];
    for (const path of files) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          // A JSX read of `.explanation` off a risk factor, e.g. {f.explanation}
          if (/\{\s*[A-Za-z_$][\w$]*\.explanation\s*\}/.test(line)) {
            offenders.push(
              `${relative(root, path).replaceAll("\\", "/")}:${index + 1}`,
            );
          }
        });
    }

    expect(
      offenders,
      "Seller surfaces must render `getOrderRiskFactorPresentation(factor)` " +
        `through t(), never the engine's English explanation:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
