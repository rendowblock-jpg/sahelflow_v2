/**
 * useI18n — client-side translation hook.
 *
 * Uses React 19's `use()` hook with a cached promise to load translations
 * without setState-in-effect violations. The promise is cached module-level
 * so switching locales is instant after first load.
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   <p>{t("nav.dashboard")}</p>
 */
"use client";

import { use, useCallback, useEffect, useMemo } from "react";
import { useUIStore } from "@/stores/ui-store";
import { loadTranslations, getDirection, type Locale } from "@/lib/i18n";

type Translations = Record<string, string>;

// Cache translation promises (module-level, survives re-renders)
const translationPromiseCache = new Map<Locale, Promise<Translations>>();

function getTranslationPromise(locale: Locale): Promise<Translations> {
  let promise = translationPromiseCache.get(locale);
  if (!promise) {
    promise = loadTranslations(locale);
    translationPromiseCache.set(locale, promise);
  }
  return promise;
}

export function useI18n() {
  const locale = useUIStore((s) => s.locale);
  const setLocaleStore = useUIStore((s) => s.setLocale);

  // React 19 `use()` — suspends until the promise resolves.
  // The promise is cached, so subsequent renders with the same locale are instant.
  const translations = use(getTranslationPromise(locale));

  // Sync <html lang> + dir attributes (external DOM — legitimate effect use)
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value = translations[key] ?? key;
      if (params) {
        for (const [param, val] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, "g"), String(val));
        }
      }
      return value;
    },
    [translations],
  );

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleStore(newLocale);
    },
    [setLocaleStore],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);

  return { t, locale, setLocale, dir };
}
