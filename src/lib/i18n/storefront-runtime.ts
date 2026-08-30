import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for buyer-facing storefront copy (R4-c).
 *
 * The 236 static `storefront.*` keys already ship with full ar/fr/en parity
 * in src/lib/i18n/locales/*.json, so only switcher-owned copy lives here.
 * Keys are candidates for promotion into the locale JSON bundle during the
 * central locale pass (locales/*.json are PR #355-owned).
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "storefront.language.label": "Language",
  },
  fr: {
    "storefront.language.label": "Langue",
  },
  ar: {
    "storefront.language.label": "اللغة",
  },
};

export function getStorefrontRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
