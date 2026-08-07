/**
 * Internationalization foundation — AR/FR/EN with RTL support.
 *
 * Static translations live in src/lib/i18n/locales/. The locale cookie is the
 * shared server/client source of truth; the client UI store mirrors that cookie
 * for immediate interaction without persisting a competing locale value.
 * Runtime-owned copy is resolved through runtime-translations.ts by both server
 * and client translators.
 */

export type Locale = "ar" | "fr" | "en";

export const LOCALES: readonly Locale[] = ["ar", "fr", "en"] as const;

export const DEFAULT_LOCALE: Locale = "fr";

export const RTL_LOCALES: readonly Locale[] = ["ar"] as const;

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return isRTL(locale) ? "rtl" : "ltr";
}

/** Type-safe translation key lookup surface (dotted path: "orders.status.confirmed"). */
export type TranslationKey = string;

/** Load the static locale bundle dynamically for client code-splitting. */
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
