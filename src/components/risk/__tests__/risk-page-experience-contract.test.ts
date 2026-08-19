import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("Risk Engine seller workspace contract", () => {
  it("keeps the overview calm and decision-first", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-seller-workspace="v3"');
    expect(page).toContain('data-risk-overview-kpis="true"');
    expect(page.match(/<StatCard/g) ?? []).toHaveLength(4);
    expect(page.match(/tone="neutral"/g) ?? []).toHaveLength(4);
    expect(page).not.toContain("avgRiskTone");
    expect(page).not.toContain("highRiskTone");
    expect(page).not.toContain("confirmationTone");
    expect(page).not.toContain("returnTone");
    expect(page).not.toContain("blacklistTone");
    expect(page).not.toContain("savingsTone");
  });

  it("gives the primary trend the full overview width with every semantic threshold and no decorative bands", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-primary-trend="true"');
    expect(page).toContain('className="w-full"');
    expect(page).toContain('height="clamp(20rem, 30vw, 25rem)"');
    expect(page).toContain("referenceLines={riskReferenceLines}");
    expect(page).toContain("value: config.thresholds.low");
    expect(page).toContain("value: config.thresholds.medium");
    expect(page).toContain("value: config.thresholds.high");
    expect(page).not.toContain("riskReferenceBands");
    expect(page).not.toContain("referenceBands={");
  });

  it("promotes exact positive risk impact in the seller attention panel", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");
    const analytics = source("../../../lib/risk-engine/analytics.ts");

    expect(page).toContain("report.attentionFactors[0]");
    expect(analytics).toContain("positivePoints: number");
    expect(analytics).toContain(
      "current.positivePoints += Math.max(factor.points, 0)",
    );
    expect(analytics).toContain(
      ".filter((factor) => factor.positivePoints > 0)",
    );
    expect(analytics).toContain(
      "right.positivePoints - left.positivePoints",
    );
    expect(page).not.toContain("factor.avgPoints > 0");
  });

  it("separates seller signals from deeper analytical tables", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-seller-signals="true"');
    expect(page).toContain('data-risk-confirmation-table="true"');
    expect(page).toContain('TabsContent value="analysis"');
    expect(page).toContain('TabsContent value="blacklist"');
    expect(page).toContain('TabsContent value="control"');
    expect(page).toContain('TabsContent value="rules"');
  });

  it("uses dedicated seller-facing AR/FR/EN copy for the attention panel", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");
    const copy = source("../../../lib/i18n/risk-workspace.ts");

    expect(page).toContain("getRiskWorkspaceCopy");
    expect(page).toContain('riskCopy("attentionTitle")');
    expect(page).toContain('riskCopy("attentionDescription")');
    expect(page).toContain('riskCopy("highestImpactFactor")');
    expect(copy).toContain('attentionTitle: "What needs your attention"');
    expect(copy).toContain('attentionTitle: "Ce qui mérite votre attention"');
    expect(copy).toContain('attentionTitle: "ما يحتاج انتباهك الآن"');
    expect(copy).toContain('highestImpactFactor: "Highest-impact risk factor"');
    expect(copy).toContain('highestImpactFactor: "Facteur de risque le plus impactant"');
    expect(copy).toContain('highestImpactFactor: "عامل الخطر الأعلى تأثيرًا"');
  });
});
