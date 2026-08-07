/**
 * Server-side i18n — for server components.
 *
 * Reads the locale from a cookie or defaults to French. Static locale JSON and
 * runtime-owned copy share the same fallback resolver as the hydrated client so
 * Server Components cannot leak a dotted key that the client later translates.
 */
import "server-only";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Locale } from "@/lib/i18n";
import { getDirection, DEFAULT_LOCALE } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { cookies } from "next/headers";

const translationCache = new Map<Locale, Record<string, string>>();

export function loadTranslationsSync(locale: Locale): Record<string, string> {
  const cached = translationCache.get(locale);
  if (cached) {
    return cached;
  }
  const filePath = resolve(process.cwd(), "src/lib/i18n/locales", `${locale}.json`);
  if (!existsSync(filePath)) {
    return {};
  }
  const content = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(content) as Record<string, string>;
  translationCache.set(locale, parsed);
  return parsed;
}

async function getLocaleFromCookie(): Promise<Locale> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("sahelflow-locale");
  if (
    localeCookie?.value === "ar" ||
    localeCookie?.value === "fr" ||
    localeCookie?.value === "en"
  ) {
    return localeCookie.value;
  }
  return DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocaleFromCookie();
  const translations = loadTranslationsSync(locale);
  const dir = getDirection(locale);

  const t = (key: string, params?: Record<string, string | number>): string => {
    let value = translations[key] ?? getRuntimeTranslation(locale, key) ?? key;
    if (params && "count" in params) {
      const pluralRule = new Intl.PluralRules(locale).select(Number(params.count));
      const pluralKey = `${key}_${pluralRule}`;
      value =
        translations[pluralKey] ??
        getRuntimeTranslation(locale, pluralKey) ??
        value;
    }
    if (params) {
      for (const [param, val] of Object.entries(params)) {
        value = value.replace(
          new RegExp(`\\{\\{${param}\\}\\}`, "g"),
          String(val),
        );
      }
    }
    return value;
  };

  return { t, locale, dir };
}
