"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  getDirection,
  getTranslations,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { useServerLocale } from "@/lib/i18n/server-locale-context";
import { useUIStore } from "@/stores/ui-store";

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

  // All three compact product bundles are synchronously available. A language
  // switch therefore cannot suspend between committing direction and rendering
  // the matching copy, even if the user switches immediately after hydration.
  const translations = getTranslations(locale);

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
      if (newLocale === locale) return;
      setLocaleStore(newLocale);
    },
    [locale, setLocaleStore],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir };
}
