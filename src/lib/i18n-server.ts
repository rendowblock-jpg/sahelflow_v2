/**
 * Server-side i18n — for server components.
 *
 * Reads the locale from a cookie, detects it from `Accept-Language` on the
 * first visit (no cookie yet), or defaults to French. Static locale JSON and
 * runtime-owned copy share the same fallback resolver as the hydrated client so
 * Server Components cannot leak a dotted key that the client later translates.
 *
 * Packaged-artifact dictionary loading (d6 finding #3):
 * The dictionaries are read at RUNTIME from
 * `resolve(process.cwd(), "src/lib/i18n/locales/<locale>.json")`. Two layers
 * guarantee those files exist in the installed standalone artifact:
 *   1. `outputFileTracingIncludes` in next.config.ts puts them in every
 *      server route trace at that exact relative path;
 *   2. `src-tauri/build-frontend.ts` copies the directory into
 *      `.next/standalone` as a deterministic belt-and-suspenders.
 * The standalone server.js `process.chdir(__dirname)`s at boot, so
 * `process.cwd()` is the standalone root at request time. The JSONs total
 * ~490 KB, so they intentionally stay OUT of the server bundle (the client
 * already statically links all three for instant switching); if the runtime
 * read still fails, a coded warning is logged once per locale instead of
 * failing silently to dotted keys.
 */
import "server-only";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Locale } from "@/lib/i18n";
import {
  getDirection,
  DEFAULT_LOCALE,
  stabilizeBidiText,
} from "@/lib/i18n";
import { parseAcceptLanguageLocale } from "@/lib/i18n/storefront-locale";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { logger } from "@/lib/logger";
import { cookies, headers } from "next/headers";

const translationCache = new Map<Locale, Record<string, string>>();
const warnedLocaleFiles = new Set<string>();

function localeFilePath(locale: string): string {
  return resolve(process.cwd(), "src/lib/i18n/locales", `${locale}.json`);
}

function readLocaleFile(locale: Locale): Record<string, string> | null {
  const filePath = localeFilePath(locale);
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
  } catch {
    return null;
  }
}

export function loadTranslationsSync(locale: Locale): Record<string, string> {
  const cached = translationCache.get(locale);
  if (cached) {
    return cached;
  }
  const parsed = readLocaleFile(locale);
  if (parsed) {
    translationCache.set(locale, parsed);
    return parsed;
  }
  // Visible health signal: without this, a missing packaged dictionary would
  // silently degrade every server component to runtime dictionaries and raw
  // dotted keys while the installed UI gate (titles/beacons) still passed.
  if (!warnedLocaleFiles.has(locale)) {
    warnedLocaleFiles.add(locale);
    logger.warn("i18n.server_locale_file_missing", {
      locale,
      path: localeFilePath(locale),
      cwd: process.cwd(),
      impact: "server-rendered static copy falls back to runtime dictionaries and raw keys",
    });
  }
  return {};
}

/** Durable seller preference cookie (explicit choice only — never detection). */
const SELLER_LOCALE_COOKIE = "sahelflow-locale";

/**
 * Resolve the seller dashboard locale.
 *
 * Precedence: explicit `sahelflow-locale` cookie > `Accept-Language` header >
 * French default. First-visit detection reuses the buyer-facing q-weighted
 * parser (`parseAcceptLanguageLocale`, Algeria market priority ar > fr > en)
 * and deliberately never persists a cookie: an explicit choice remains the
 * only durable authority, and `ServerLocaleProvider` reconciles the client
 * mirror to the server-resolved locale on every RSC commit.
 */
export function resolveSellerLocale(input: {
  cookieValue?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  const cookie = input.cookieValue;
  if (cookie === "ar" || cookie === "fr" || cookie === "en") {
    return cookie;
  }
  return parseAcceptLanguageLocale(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

async function getLocaleForRequest(): Promise<Locale> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  return resolveSellerLocale({
    cookieValue: cookieStore.get(SELLER_LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export async function getI18n() {
  const locale = await getLocaleForRequest();
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
    return stabilizeBidiText(value, locale);
  };

  return { t, locale, dir };
}
