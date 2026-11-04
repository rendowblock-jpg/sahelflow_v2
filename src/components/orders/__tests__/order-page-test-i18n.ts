import { getTranslations, type Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

export const PAGE_LOCALES: readonly Locale[] = ["en", "fr", "ar"] as const;

export type PageT = (key: string, params?: Record<string, string | number>) => string;

/** The server translator of the app (src/lib/i18n-server.ts) without cookies: key, plural suffix, {{param}}. */
export function makeT(locale: Locale): PageT {
  const dict = getTranslations(locale);
  return (key, params) => {
    let value = dict[key] ?? getRuntimeTranslation(locale, key) ?? key;
    if (params && "count" in params) {
      const rule = new Intl.PluralRules(locale).select(Number(params.count));
      value = dict[`${key}_${rule}`] ?? getRuntimeTranslation(locale, `${key}_${rule}`) ?? value;
    }
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) =>
      params && name in params ? String(params[name]) : `{{${name}}}`,
    );
  };
}

/** A raw dictionary key leaking into the page looks like orders.detail.summary.total. */
export const RAW_KEY = /\b(?:orders|orderLifecycle|risk|deliveries|common|ai)\.[A-Za-z]+(?:\.[A-Za-z_]+)*/;
