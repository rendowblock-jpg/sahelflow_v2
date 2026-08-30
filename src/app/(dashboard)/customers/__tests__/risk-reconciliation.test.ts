import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getEntityDetailRuntimeTranslation } from "@/lib/i18n/entity-detail-runtime";

// URL-based paths percent-encode the bracketed [id] route segment, so resolve
// from the repo root like the page-authority contract tests do.
function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const RUNTIME_KEYS = [
  "customerRisk.engine.label",
  "customerRisk.engine.scaleHint",
  "customerRisk.engine.latestOrder",
  "customerRisk.engine.noOrders",
  "customerRisk.engine.unavailable",
  "customerRisk.engine.meterAria",
  "customerRisk.signals.label",
  "customerRisk.signals.scaleHint",
  "customerRisk.signals.noScore",
  "customerRisk.signals.meterAria",
  "customerRisk.disagreeNote",
];

describe("customer detail risk reconciliation (R3-c)", () => {
  it("renders BOTH risk scales with explicit labels — no silent merge", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");
    const card = source("src/components/customers/customer-risk-card.tsx");

    expect(page).toContain("<CustomerRiskCard");
    expect(card).toContain('data-customer-risk-reconciliation="dual-scale"');
    expect(card).toContain('data-customer-risk-engine="0-100"');
    expect(card).toContain('data-customer-risk-signals="0-10"');
    // Explicit scale labels come from the runtime dictionary…
    expect(page).toContain('"customerRisk.engine.label"');
    expect(page).toContain('"customerRisk.signals.label"');
    // …and the signals thresholds come from the shared scale authority.
    expect(page).toContain("CUSTOMER_SIGNALS_SCALE.mediumThreshold");
    expect(page).toContain("CUSTOMER_SIGNALS_SCALE.highThreshold");
    expect(page).toContain("getCustomerSignalsLevel");
    // The page must NOT carry its own private threshold copies anymore.
    expect(page).not.toContain("score >= 6");
    expect(page).not.toContain("score >= 3");
  });

  it("never converts one scale into the other", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");
    const scale = source("src/lib/customers/customer-risk-scale.ts");
    const card = source("src/components/customers/customer-risk-card.tsx");

    for (const file of [page, scale, card]) {
      expect(file).not.toMatch(/riskScore\s*\*\s*10/);
      expect(file).not.toMatch(/\*\s*10\s*\)\s*\/\s*100/);
    }
    // The signals meter divides by the index ceiling, it does not multiply
    // the index into an engine-scale score.
    expect(scale).toContain("score / CUSTOMER_SIGNALS_SCALE.max");
  });

  it("surfaces the engine verdict read-only behind the risk.read authority", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");

    expect(page).toContain('trustedActionAllowed(actorContext, "risk.read"');
    expect(page).toContain("assessOrderRisk");
    expect(page).toContain("getRiskConfig");
    // Read-only usage: config load + assessment, no config/rules writes.
    expect(page).not.toContain("saveRiskConfig");
    expect(page).not.toContain("saveRiskRules");
    expect(page).not.toContain("incrementRuleTriggers");
  });

  it("matches the order-detail risk card component language", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");
    const card = source("src/components/customers/customer-risk-card.tsx");

    expect(card).toContain("RiskLevelBadgeServer");
    expect(card).toContain("RiskActionBadgeServer");
    expect(page).toContain("risk.assessment.action");
    // Same level/action vocabularies as the orders surface.
    expect(page).toContain("risk.level.${level}");
    expect(page).toContain("risk.action.${action}");
  });

  it("shows a subtle note only when the two tiers disagree", () => {
    const card = source("src/components/customers/customer-risk-card.tsx");
    const scale = source("src/lib/customers/customer-risk-scale.ts");

    expect(card).toContain('data-customer-risk-disagree="true"');
    expect(card).toContain("signalsLevelsDisagree");
    expect(scale).toContain("signalsLevelsDisagree");
  });

  it("ships every customerRisk key in en, fr and ar", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const key of RUNTIME_KEYS) {
        expect(
          getEntityDetailRuntimeTranslation(locale, key),
          `${locale}:${key}`,
        ).toBeTruthy();
      }
    }
  });

  it("registers the entity-detail runtime dictionary in the shared resolver", () => {
    const registry = source("src/lib/i18n/runtime-translations.ts");

    expect(registry).toContain("getEntityDetailRuntimeTranslation");
  });
});
