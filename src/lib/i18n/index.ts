import arTranslations from "./locales/ar.json";
import enTranslations from "./locales/en.json";
import frTranslations from "./locales/fr.json";

/**
 * Internationalization foundation — AR/FR/EN with RTL support.
 *
 * Static translations live in src/lib/i18n/locales/. The locale cookie is the
 * shared server/client source of truth; the client UI store mirrors that cookie
 * for immediate interaction without persisting a competing locale value.
 * Runtime-owned copy is resolved through runtime-translations.ts by both server
 * and client translators.
 *
 * SahelFlow intentionally keeps all three compact product locale bundles in the
 * application module graph. A language switch therefore never waits on a new
 * network/module chunk before React can render the matching text and geometry.
 */

export type Locale = "ar" | "fr" | "en";

export const LOCALES: readonly Locale[] = ["ar", "fr", "en"] as const;

export const DEFAULT_LOCALE: Locale = "fr";

export const RTL_LOCALES: readonly Locale[] = ["ar"] as const;

const STATIC_TRANSLATIONS = {
  ar: arTranslations,
  fr: frTranslations,
  en: enTranslations,
} satisfies Record<Locale, Record<string, string>>;

const LRI = "\u2066";
const PDI = "\u2069";
const LTR_INLINE_RUN =
  /(?:[0-9٠-٩۰-۹]+(?:[.,،][0-9٠-٩۰-۹]+)?\s*[%٪]?\s*[-–—]\s*[0-9٠-٩۰-۹]+(?:[.,،][0-9٠-٩۰-۹]+)?\s*[%٪]?|[A-Za-z0-9٠-٩۰-۹]+(?:[._:+/@#-][A-Za-z0-9٠-٩۰-۹]+)*(?:\s*[%٪])?)/g;

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return isRTL(locale) ? "rtl" : "ltr";
}

/**
 * Keep Arabic product copy readable when it contains Latin provider names,
 * technical IDs, percentages, dates or numeric ranges. These runs are data-like
 * LTR islands inside an RTL sentence. Unicode directional isolates are invisible
 * and do not alter the underlying copy; they only stop the bidi algorithm from
 * visually reversing punctuation/ranges or leaking direction into neighbors.
 */
export function stabilizeBidiText(value: string, locale: Locale): string {
  if (locale !== "ar" || !value) return value;
  return value.replace(LTR_INLINE_RUN, (run) => `${LRI}${run}${PDI}`);
}

/** Type-safe translation key lookup surface (dotted path: "orders.status.confirmed"). */
export type TranslationKey = string;

/**
 * Synchronous product-copy lookup used by hydrated UI so locale and direction can
 * change in one render without a Suspense/loading interval.
 */
export function getTranslations(locale: Locale): Record<string, string> {
  return STATIC_TRANSLATIONS[locale];
}

/** Async compatibility surface retained for server/existing callers. */
export async function loadTranslations(locale: Locale): Promise<Record<string, string>> {
  return getTranslations(locale);
}
