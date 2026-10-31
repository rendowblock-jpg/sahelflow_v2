import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const LOCALES = ["ar", "fr", "en"] as const;
// The old sub-line label: it said "collected" for orders that are only delivered.
const OLD_LABEL = {
  ar: "المُحصَّل اليوم",
  fr: "Encaissé aujourd'hui",
  en: "Collected today",
} as const;
const NEW_LABEL = {
  ar: "المُسلَّم اليوم",
  fr: "Livré aujourd'hui",
  en: "Delivered today",
} as const;

describe("dashboard sub-line says Delivered today (ar/fr/en)", () => {
  for (const locale of LOCALES) {
    it(`${locale}: label exists, is the agreed words, and the tooltip uses the same words`, () => {
      const label = getRuntimeTranslation(locale, "dashboard.deliveredToday");
      expect(label).toBe(NEW_LABEL[locale]);
      const tooltip = getRuntimeTranslation(locale, "dashboard.revenueDefinition") ?? "";
      expect(tooltip).toContain(NEW_LABEL[locale]);
      expect(tooltip).not.toContain(OLD_LABEL[locale]);
    });
  }

  it("the dashboard view no longer reads the old 'collected' key", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/dashboard/dashboard-view.tsx"),
      "utf8",
    );
    expect(source).toContain("dashboard.deliveredToday");
    expect(source).not.toContain("dashboard.realizedRevenue");
  });
});
