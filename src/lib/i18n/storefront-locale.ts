import {
  getDirection,
  getTranslations,
  interpolateTranslation,
  stabilizeBidiText,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

/**
 * Buyer-facing storefront locale authority (R4-c).
 *
 * The public storefront is the ONE surface in SahelFlow whose reader is not
 * the seller, so it must NOT inherit the dashboard locale cookie
 * (`sahelflow-locale`): an Arabic-only buyer landing on a French-configured
 * seller session would otherwise get a French COD checkout in Algeria.
 *
 * Resolution precedence (strictly in this order):
 *   1. `?lang=` query param — shareable per-language storefront links;
 *   2. `sf-storefront-locale` cookie — persisted ONLY when the buyer
 *      explicitly switches (detection never writes a cookie, so a first
 *      visit stays cookie-clean);
 *   3. `Accept-Language` header — first-visit detection (ar-DZ/fr-DZ map
 *      to ar/fr; Algeria market priority ar > fr > en when qualities tie);
 *   4. French default — the lingua franca fallback of the DZ market.
 *
 * This module is isomorphic: it never reads cookies/headers itself (the
 * server page feeds it raw values; the client provider holds the resolved
 * locale in React state), and the translator mirrors the dashboard `t`
 * contract exactly (runtime-dictionary fallback, count plurals, `{{}}`/`{}`
 * interpolation, bidi stabilization) so buyer copy can never render a
 * different shape than seller copy.
 */

/** Durable buyer preference cookie — intentionally NOT `sahelflow-locale`. */
export const STOREFRONT_LOCALE_COOKIE = "sf-storefront-locale";

/** Query parameter that pins a storefront link to one buyer language. */
export const STOREFRONT_LOCALE_QUERY_PARAM = "lang";

/** French is the fallback lingua franca of the Algerian buyer market. */
export const STOREFRONT_DEFAULT_LOCALE: Locale = "fr";

export const STOREFRONT_LOCALES: readonly Locale[] = ["ar", "fr", "en"] as const;

/**
 * Algeria-market preference used to break Accept-Language ties: when a
 * browser advertises several supported locales with equal quality, Arabic
 * wins (Salla/Zid Arabic-first lesson — d7-b), then French, then English.
 */
const STOREFRONT_LOCALE_PRIORITY: Record<Locale, number> = {
  ar: 0,
  fr: 1,
  en: 2,
};

export type StorefrontLocaleSource =
  | "query"
  | "cookie"
  | "accept-language"
  | "default";

export type StorefrontTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/** Parse an explicit locale value (`?lang=`, cookie) — null when unsupported. */
export function parseStorefrontLocale(
  value: string | null | undefined,
): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (STOREFRONT_LOCALES as readonly string[]).includes(normalized)
    ? (normalized as Locale)
    : null;
}

interface AcceptLanguageCandidate {
  locale: Locale;
  quality: number;
  index: number;
}

/**
 * Pick the best supported locale from an `Accept-Language` header.
 *
 * Standard quality weighting (`q=`) decides first. Equal qualities fall back
 * to the Algeria market priority (ar > fr > en) before raw header order, so a
 * bilingual ar+fr declaration lands Arabic. Unsupported languages (e.g.
 * `es-ES, it;q=0.9`) resolve to null so the caller can fall through to the
 * French default.
 */
export function parseAcceptLanguageLocale(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;
  const candidates: AcceptLanguageCandidate[] = [];
  header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry, index) => {
      const [tag, ...parameters] = entry.split(";").map((part) => part.trim());
      const primary = /^([A-Za-z]{2,8})(?:$|-|_)/.exec(tag ?? "");
      const primaryTag = primary?.[1];
      if (!primaryTag) return;
      const locale = parseStorefrontLocale(primaryTag);
      if (!locale) return;
      let quality = 1;
      for (const parameter of parameters) {
        const match = /^q=([0-9]+(?:\.[0-9]+)?)$/i.exec(parameter);
        const qualityText = match?.[1];
        if (qualityText) {
          const parsed = Number.parseFloat(qualityText);
          if (!Number.isNaN(parsed)) quality = parsed;
        }
      }
      candidates.push({ locale, quality, index });
    });
  const best = candidates.sort(
    (a, b) =>
      b.quality - a.quality ||
      STOREFRONT_LOCALE_PRIORITY[a.locale] -
        STOREFRONT_LOCALE_PRIORITY[b.locale] ||
      a.index - b.index,
  )[0];
  return best ? best.locale : null;
}

export interface StorefrontLocaleResolution {
  locale: Locale;
  source: StorefrontLocaleSource;
}

/** Resolve the buyer locale: query > cookie > Accept-Language > French. */
export function resolveStorefrontLocale(input: {
  queryLang?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): StorefrontLocaleResolution {
  const query = parseStorefrontLocale(input.queryLang);
  if (query) return { locale: query, source: "query" };
  const cookie = parseStorefrontLocale(input.cookieLocale);
  if (cookie) return { locale: cookie, source: "cookie" };
  const detected = parseAcceptLanguageLocale(input.acceptLanguage);
  if (detected) return { locale: detected, source: "accept-language" };
  return { locale: STOREFRONT_DEFAULT_LOCALE, source: "default" };
}

/** Direction for a buyer locale (RTL for Arabic). */
export function getStorefrontDirection(locale: Locale): "ltr" | "rtl" {
  return getDirection(locale);
}

/** `document.cookie` assignment for an explicit buyer switch (1 year, lax). */
export function storefrontLocaleCookieAssignment(locale: Locale): string {
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  return `${STOREFRONT_LOCALE_COOKIE}=${locale};path=/;max-age=${maxAgeSeconds};samesite=lax`;
}

/**
 * Build a buyer-facing translator for an explicit locale.
 *
 * Same resolution chain as the dashboard `t` (static bundle, then runtime
 * dictionaries, then the raw key) so the storefront renders identical copy
 * shapes on the server (page RSC) and the hydrated client (provider).
 */
export function createStorefrontTranslator(
  locale: Locale,
): StorefrontTranslator {
  const translations = getTranslations(locale);
  return (key, params) => {
    let value = translations[key] ?? getRuntimeTranslation(locale, key) ?? key;
    if (params && "count" in params) {
      const pluralRule = new Intl.PluralRules(locale).select(
        Number(params.count),
      );
      const pluralKey = `${key}_${pluralRule}`;
      value =
        translations[pluralKey] ??
        getRuntimeTranslation(locale, pluralKey) ??
        value;
    }
    value = interpolateTranslation(value, params);
    return stabilizeBidiText(value, locale);
  };
}
