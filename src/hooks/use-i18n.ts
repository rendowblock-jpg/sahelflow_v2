/**
 * useI18n — client-side translation hook (hydration-safe).
 *
 * Uses React 19's `use()` hook with a cached promise to load translations
 * without setState-in-effect violations. The promise is cached module-level
 * so switching locales is instant after first load.
 *
 * HYDRATION SAFETY:
 * The initial locale comes from ServerLocaleContext (set by the Server Component
 * layout from the cookie). This ensures the server + client first render use
 * the SAME locale → no hydration mismatch. After mount, the store locale (from
 * the cookie via getCookieLocale) takes over for live locale switching.
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   <p>{t("nav.dashboard")}</p>
 */
"use client";

import { use, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useUIStore } from "@/stores/ui-store";
import { loadTranslations, getDirection, type Locale } from "@/lib/i18n";
import { useServerLocale } from "@/lib/i18n/server-locale-context";

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

/** SSR-safe "are we on the client?" via useSyncExternalStore. */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useI18n() {
  const serverLocale = useServerLocale();
  const storeLocale = useUIStore((s) => s.locale);
  const setLocaleStore = useUIStore((s) => s.setLocale);
  const mounted = useIsMounted();

  // Use the server locale for the initial render (server + client first render),
  // then switch to the store locale after mount. This ensures hydration matches
  // (both use serverLocale) while still supporting live locale switching.
  const locale = mounted ? storeLocale : serverLocale;

  // React 19 `use()` — suspends until the promise resolves.
  // The promise is cached, so subsequent renders with the same locale are instant.
  const translations = use(getTranslationPromise(locale));

  // Sync <html lang> + dir attributes (external DOM — legitimate effect use)
  // Only runs after mount (no-op on server).
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value = translations[key] ?? key;
      // UX-008: CLDR plural support
      if (params && "count" in params) {
        const pluralRule = new Intl.PluralRules(locale).select(Number(params.count));
        if (translations[`${key}_${pluralRule}`]) value = translations[`${key}_${pluralRule}`]!;
      }
      if (params) {
        for (const [param, val] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{\\{${param}\\}\\}`, "g"), String(val));
        }
      }
      return value;
    },
    [translations, locale],
  );

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleStore(newLocale);
      // Also set a cookie so the server can read the locale for SSR-correct
      // <html lang/dir> attributes (eliminates hydration flash for Arabic).
      if (typeof document !== "undefined") {
        document.cookie = `sahelflow-locale=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    },
    [setLocaleStore],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);

  return { t, locale, setLocale, dir };
}
