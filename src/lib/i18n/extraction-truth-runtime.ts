import type { Locale } from "@/lib/i18n";

/** Runtime copy for the extraction dashboard: what a confidence number is. */
const translations: Partial<Record<Locale, Record<string, string>>> = {
  en: { "analytics.extraction.notMeasured": "not measured", "analytics.extraction.selfReported": "self-reported" },
  fr: { "analytics.extraction.notMeasured": "non mesuré", "analytics.extraction.selfReported": "déclaré par le modèle" },
  ar: { "analytics.extraction.notMeasured": "غير مقاس", "analytics.extraction.selfReported": "تقدير من النموذج نفسه" },
};

export function getExtractionTruthRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
