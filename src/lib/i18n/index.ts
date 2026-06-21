/**
 * Internationalization module — AR/FR/EN with RTL support.
 *
 * Design system Section 12.2: "Full AR/FR/EN. No hardcoded strings. RTL support."
 *
 * Architecture: Translations are JSON files in src/lib/i18n/locales/.
 * The active locale is stored in Zustand (user preference, persisted).
 * RTL is applied automatically when locale === "ar".
 */

export type Locale = "ar" | "fr" | "en";

export const LOCALES: readonly Locale[] = ["ar", "fr", "en"] as const;

export const DEFAULT_LOCALE: Locale = "fr"; // French is the business default in Algeria

export const RTL_LOCALES: readonly Locale[] = ["ar"] as const;

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return isRTL(locale) ? "rtl" : "ltr";
}

/** Type-safe translation key lookup (dotted path: "orders.status.confirmed") */
export type TranslationKey = string;

/** Load translations for a locale (dynamically imported for code-splitting) */
export async function loadTranslations(locale: Locale): Promise<Record<string, string>> {
  switch (locale) {
    case "ar":
      return (await import("./locales/ar.json")).default;
    case "fr":
      return (await import("./locales/fr.json")).default;
    case "en":
      return (await import("./locales/en.json")).default;
  }
}
