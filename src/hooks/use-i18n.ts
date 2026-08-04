"use client";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { getDirection, loadTranslations, type Locale } from "@/lib/i18n";
import { getAutomationRuntimeTranslation } from "@/lib/i18n/automation-runtime";
import { getCommerceRuntimeTranslation } from "@/lib/i18n/commerce-runtime";
import { getWhatsAppRecoveryTranslation } from "@/lib/i18n/whatsapp-recovery";
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

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value =
        translations[key] ??
        getAutomationRuntimeTranslation(locale, key) ??
        getCommerceRuntimeTranslation(locale, key) ??
        getWhatsAppRecoveryTranslation(locale, key) ??
        key;
      if (params && "count" in params) {
        const pluralRule = new Intl.PluralRules(locale).select(
          Number(params.count),
        );
        if (translations[`${key}_${pluralRule}`]) {
          value = translations[`${key}_${pluralRule}`]!;
        }
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
      if (typeof document !== "undefined") {
        document.cookie = `sahelflow-locale=${newLocale}; path=/; max-age=${
          60 * 60 * 24 * 365
        }; samesite=lax`;
      }
    },
    [setLocaleStore],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir };
}
