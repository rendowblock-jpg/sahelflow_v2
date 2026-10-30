import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for the Carnet colour preset card (Settings > Appearance).
 * The Arabic and French lines are a helper draft: the founder reads them natively.
 */
const COPY = {
  en: {
    "settings.appearance.preset.carnet": "Ledger",
    "settings.appearance.presetCarnetDescription": "Cream paper and graphite ink, like the shop's own notebook.",
  },
  fr: {
    "settings.appearance.preset.carnet": "Carnet",
    "settings.appearance.presetCarnetDescription": "Papier crème et encre graphite, comme le cahier de la boutique.",
  },
  ar: {
    "settings.appearance.preset.carnet": "الدفتر",
    "settings.appearance.presetCarnetDescription": "ورق كريمي وحبر رمادي داكن، كدفتر المحل.",
  },
} as const satisfies Record<Locale, Readonly<Record<string, string>>>;

export function getAppearanceCarnetRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return (COPY[locale] as Readonly<Record<string, string>>)[key];
}
