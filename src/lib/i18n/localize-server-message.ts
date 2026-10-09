/**
 * Localize a raw API error message for the seller.
 *
 * Routes answer with stable English (`{ error, code }`); many screens surface
 * that `error` directly, in a toast or inline. This maps any known server
 * message onto the active interface language (read from <html lang>, which
 * use-i18n keeps in sync) through the shared translate-server-error rules.
 * Messages that match no rule — already translated copy, names, numbers —
 * pass through unchanged. Safe to call during SSR (returns the input).
 */
import {
  LOCALES,
  getTranslations,
  interpolateTranslation,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { translateServerError } from "@/lib/i18n/translate-server-error";

export function localizeServerMessage(message: string): string {
  if (typeof document === "undefined" || !message) return message;
  const lang = document.documentElement.lang;
  const locale: Locale = (LOCALES as readonly string[]).includes(lang)
    ? (lang as Locale)
    : "en";
  const catalog = getTranslations(locale);
  const t = (key: string, params?: Record<string, string | number>) =>
    interpolateTranslation(
      catalog[key] ?? getRuntimeTranslation(locale, key) ?? key,
      params,
    );
  return translateServerError(message, t, message);
}
