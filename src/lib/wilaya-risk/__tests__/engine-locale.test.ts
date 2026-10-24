/**
 * The engine's label and recommendation come from the locale files, so the
 * same level reads the same in the app, the API and the AI tool, in ar/fr/en.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getTranslations } from "@/lib/i18n";

import { assessOrderRisk } from "../engine";

function contextWithLevel(riskLevel: number) {
  const row = { wilaya: "Oran", riskLevel, confirmationRate: 0.5, returnRate: 0.1, notes: null };
  return {
    prisma: { wilayaRiskProfile: { findUnique: async () => row } } as never,
    shop: {} as never,
  };
}

describe("wilaya risk assessment text", () => {
  it.each(["ar", "fr", "en"] as const)("%s: label and recommendation are the locale file's text for every level", async (locale) => {
    const t = getTranslations(locale);
    for (const level of [1, 2, 3, 4, 5]) {
      const result = await assessOrderRisk(contextWithLevel(level), "Oran", locale);
      expect(result.level).toBe(level);
      expect(result.label).toBe(t[`wilaya.risk.level.${level}`]);
      expect(result.recommendation).toBe(t[`wilaya.risk.recommendation.${level}`]);
      expect(result.labelKey).toBe(`wilaya.risk.level.${level}`);
      expect(result.recommendationKey).toBe(`wilaya.risk.recommendation.${level}`);
    }
  });

  it("Arabic really is Arabic and differs from French", async () => {
    const ar = await assessOrderRisk(contextWithLevel(5), "Oran", "ar");
    const fr = await assessOrderRisk(contextWithLevel(5), "Oran", "fr");
    expect(ar.label).toMatch(/[\u0600-\u06ff]/);
    expect(ar.recommendation).toMatch(/[\u0600-\u06ff]/);
    expect(ar.label).not.toBe(fr.label);
  });

  it("keeps French as the default, byte for byte what it was", async () => {
    const result = await assessOrderRisk(contextWithLevel(5), "Oran");
    expect(result.label).toBe("Très élevé");
    expect(result.recommendation).toBe("Prépaiement recommandé ou confirmation double");
  });

  it("an out-of-range level shows the moderate text, as before", async () => {
    const result = await assessOrderRisk(contextWithLevel(9), "Oran", "en");
    expect(result.level).toBe(9);
    expect(result.label).toBe(getTranslations("en")["wilaya.risk.level.3"]);
    expect(result.recommendationKey).toBe("wilaya.risk.recommendation.3");
  });

  it("holds no French wording of its own", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/wilaya-risk/engine.ts"), "utf8");
    expect(source).not.toMatch(/Très faible|Modéré|Élevé|Confirmer par|Prépaiement|Confirmation standard/);
  });
});
