import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { formatPositiveRiskPoints } from "@/lib/i18n/risk-workspace";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

function signed(locale: string, points: number): string {
  return new Intl.NumberFormat(locale, {
    signDisplay: "exceptZero",
    maximumFractionDigits: 1,
  }).format(points);
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
    expect(page).toContain(
      "formatPositiveRiskPoints(locale, topFactor.positivePoints)",
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
    expect(page).toContain("formatPositiveRiskPoints");
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

  it("executes count-aware impact grammar across EN, FR and Arabic plural categories", () => {
    expect(formatPositiveRiskPoints("en", 1)).toBe(
      `${signed("en-GB", 1)} positive risk point`,
    );
    expect(formatPositiveRiskPoints("en", 2)).toBe(
      `${signed("en-GB", 2)} positive risk points`,
    );
    expect(formatPositiveRiskPoints("fr", 1)).toBe(
      `${signed("fr-DZ", 1)} point de risque positif`,
    );
    expect(formatPositiveRiskPoints("fr", 2)).toBe(
      `${signed("fr-DZ", 2)} points de risque positifs`,
    );

    expect(formatPositiveRiskPoints("ar", 1)).toBe(
      `نقطة خطر إيجابية واحدة (${signed("ar-DZ", 1)})`,
    );
    expect(formatPositiveRiskPoints("ar", 2)).toBe(
      `نقطتا خطر إيجابيتان (${signed("ar-DZ", 2)})`,
    );
    expect(formatPositiveRiskPoints("ar", 3)).toBe(
      `${signed("ar-DZ", 3)} نقاط خطر إيجابية`,
    );
    expect(formatPositiveRiskPoints("ar", 11)).toBe(
      `${signed("ar-DZ", 11)} نقطة خطر إيجابية`,
    );
    expect(formatPositiveRiskPoints("ar", 100)).toBe(
      `${signed("ar-DZ", 100)} نقطة خطر إيجابية`,
    );
  });
});
