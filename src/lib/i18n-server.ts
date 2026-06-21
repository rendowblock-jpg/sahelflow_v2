/**
 * Server-side i18n — for server components.
 *
 * Reads the locale from a cookie (set by the client UI store) or defaults to 'fr'.
 * Loads translations synchronously via require().
 */
import "server-only";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Locale } from "@/lib/i18n";
import { getDirection, DEFAULT_LOCALE } from "@/lib/i18n";
import { cookies } from "next/headers";

// Cache translations (module-level)
const translationCache = new Map<Locale, Record<string, string>>();

function loadTranslationsSync(locale: Locale): Record<string, string> {
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
  if (localeCookie?.value === "ar" || localeCookie?.value === "fr" || localeCookie?.value === "en") {
    return localeCookie.value;
  }
  return DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocaleFromCookie();
  const translations = loadTranslationsSync(locale);
  const dir = getDirection(locale);

  const t = (key: string, params?: Record<string, string | number>): string => {
    let value = translations[key] ?? key;
    if (params) {
      for (const [param, val] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, "g"), String(val));
      }
    }
    return value;
  };

  return { t, locale, dir };
}
