"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  getDirection,
  getTranslations,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { useServerLocale } from "@/lib/i18n/server-locale-context";
import { requestLocale, useUIStore } from "@/stores/ui-store";

function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useI18n() {
  const router = useRouter();
  const serverLocale = useServerLocale();
  const storeLocale = useUIStore((state) => state.locale);
  const [isLocalePending, startLocaleTransition] = useTransition();
  const mounted = useIsMounted();
  const locale = mounted ? storeLocale : serverLocale;

  // All three compact product bundles are synchronously available. The active
  // bundle is therefore ready in the same commit as the server-confirmed locale.
  const translations = getTranslations(locale);

  // ServerLocaleProvider commits document language/direction in a layout effect
  // when a refreshed server tree arrives. Keep this as an idempotent safeguard for
  // initial hydration and any future committed-locale update path.
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

  /**
   * Request, then refresh. Do not mutate hydrated locale/direction here: server
   * translated route copy still belongs to the current request until the new RSC
   * tree arrives. ServerLocaleProvider commits the requested locale before paint.
   */
  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale || isLocalePending) return;
      requestLocale(newLocale);
      startLocaleTransition(() => {
        router.refresh();
      });
    },
    [isLocalePending, locale, router],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir, isLocalePending };
}
