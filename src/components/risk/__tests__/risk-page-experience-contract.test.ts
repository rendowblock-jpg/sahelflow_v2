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

    expect(page).toContain('data-risk-seller-workspace="v4"');
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

  it("gives the orders-and-returns trend the full overview width", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-primary-trend="true"');
    expect(page).toContain('className="w-full"');
    expect(page).toContain('xKey="week"');
    expect(page).toContain('key: "cameBack"');
    expect(page).toContain("<RankedMetricList");
    expect(page).not.toContain("riskReferenceBands");
    expect(page).not.toContain("referenceBands={");
  });

  it("leads with what the seller acts on and measures money from real costs", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");
    const sections = source("../risk-seller-sections.tsx");
    const analytics = source("../../../lib/risk-engine/analytics.ts");

    expect(page).toContain("<CheckBeforeShipping");
    expect(page).toContain("<ScoreCheck");
    expect(page).toContain("<WhereYouLoseMoney");
    expect(sections).toContain('data-risk-check-queue="true"');
    expect(sections).toContain('data-risk-score-check="true"');
    expect(analytics).toContain("customerHistoryBefore(");
    expect(analytics).not.toContain("* 600");
  });

  it("keeps the exact positive risk impact in the score details", () => {
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

  it("uses dedicated seller-facing AR/FR/EN copy", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");
    const copy = source("../../../lib/i18n/risk-workspace.ts");

    expect(page).toContain("getRiskWorkspaceCopy");
    expect(page).toContain("formatPositiveRiskPoints");
    expect(page).toContain('riskCopy("highestImpactFactor")');
    expect(copy).toContain('checkTitle: "Check before you ship"');
    expect(copy).toContain('checkTitle: "À vérifier avant d’expédier"');
    expect(copy).toContain('checkTitle: "تحقّق قبل الشحن"');
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

describe("Risk control panel does not promise actions the engine never takes", () => {
  // autoConfirmLow / autoHoldCritical only pick a label (scoring.ts levelToAction);
  // the return-rate threshold and the behavior weight are read by nothing.
  const NOTE_KEYS = [
    "risk.control.recommendationOnlyNote",
    "risk.control.notUsedYetNote",
  ] as const;

  function section(panel: string, from: string, to: string): string {
    const start = panel.indexOf(from);
    const end = panel.indexOf(to, start + from.length);
    expect(start, `${from} marker`).toBeGreaterThan(-1);
    expect(end, `${to} marker`).toBeGreaterThan(start);
    return panel.slice(start, end);
  }

  it("shows the recommendation-only note on each of the three automatic toggles", () => {
    const panel = source("../risk-control-panel.tsx");
    const toggles = section(panel, "{/* Auto-actions */}", "{/* Auto-blacklist threshold */}");

    expect(toggles).toContain('t("risk.control.recommendationOnlyNote")');
    expect(toggles).toContain('data-risk-control-note="recommendation-only"');
    // The note sits inside the per-toggle row, so every toggle gets it.
    const row = section(toggles, ".map(({ key, labelKey }) => (", "))}");
    expect(row).toContain("risk.control.recommendationOnlyNote");
  });

  it("says the return-rate threshold and the behavior weight are not used yet", () => {
    const panel = source("../risk-control-panel.tsx");
    const threshold = section(panel, "{/* Auto-blacklist threshold */}", "{/* Actions */}");
    const weights = section(panel, "{/* Weights */}", "{/* Thresholds */}");

    expect(threshold).toContain('t("risk.control.notUsedYetNote")');
    expect(threshold).toContain('data-risk-control-note="not-used-yet"');
    expect(weights).toContain('key === "behavior"');
    expect(weights).toContain('t("risk.control.notUsedYetNote")');
  });

  it("keeps every setting: nothing removed, renamed or re-wired", () => {
    const panel = source("../risk-control-panel.tsx");

    for (const name of [
      "autoConfirmLow",
      "autoHoldCritical",
      "autoFlagBlacklist",
      "autoBlacklistReturnRate",
    ]) {
      expect(panel).toContain(name);
    }
    expect(panel).toContain('{ key: "behavior", labelKey: "risk.control.weights.behavior" }');
  });

  it("has the same note keys, as real text, in Arabic, French and English", () => {
    const read = (locale: string) =>
      JSON.parse(source(`../../../lib/i18n/locales/${locale}.json`)) as Record<string, unknown>;
    const ar = read("ar");
    const fr = read("fr");
    const en = read("en");

    for (const key of NOTE_KEYS) {
      for (const [name, bundle] of [["ar", ar], ["fr", fr], ["en", en]] as const) {
        const text = bundle[key];
        expect(typeof text, `${name}:${key}`).toBe("string");
        expect((text as string).trim().length, `${name}:${key} not empty`).toBeGreaterThan(20);
      }
      expect(ar[key]).toMatch(/[\u0600-\u06FF]/);
      expect(fr[key]).not.toBe(en[key]);
      expect(ar[key]).not.toBe(en[key]);
    }
  });
});
