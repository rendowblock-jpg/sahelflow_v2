"use client";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  getDirection,
  loadTranslations,
  LOCALES,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { useServerLocale } from "@/lib/i18n/server-locale-context";
import { useUIStore } from "@/stores/ui-store";

type Translations = Record<string, string>;
const translationPromiseCache = new Map<Locale, Promise<Translations>>();

function getTranslationPromise(locale: Locale): Promise<Translations> {
  let promise = translationPromiseCache.get(locale);
  if (!promise) {
    promise = loadTranslations(locale);
    translationPromiseCache.set(locale, promise);
  }
  return promise;
}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useI18n() {
  const serverLocale = useServerLocale();
  const storeLocale = useUIStore((state) => state.locale);
  const setLocaleStore = useUIStore((state) => state.setLocale);
  const mounted = useIsMounted();
  const locale = mounted ? storeLocale : serverLocale;
  const translations = use(getTranslationPromise(locale));

  // SahelFlow ships only three compact locale bundles. Warm the inactive bundles
  // once the client is mounted so subsequent language switches do not suspend on
  // a first-time dynamic import before the shell can update.
  useEffect(() => {
    for (const candidate of LOCALES) {
      if (candidate === locale) continue;
      void getTranslationPromise(candidate).catch(() => {
        translationPromiseCache.delete(candidate);
      });
    }
  }, [locale]);

  // The store applies lang/dir synchronously during an interactive switch. This
  // effect is an idempotent reconciliation boundary for initial hydration and any
  // future locale authority that updates the store outside that interaction.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
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
      if (params) {
        for (const [param, replacement] of Object.entries(params)) {
          value = value.replace(
            new RegExp(`\\{\\{${param}\\}\\}`, "g"),
            String(replacement),
          );
        }
      }
      return value;
    },
    [translations, locale],
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
