"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

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
  const serverLocale = useServerLocale();
  const storeLocale = useUIStore((state) => state.locale);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const mounted = useIsMounted();
  const locale = mounted ? storeLocale : serverLocale;
  const isLocalePending = pendingLocale !== null;

  // All three compact product bundles are synchronously available. The active
  // bundle is therefore ready in the same commit as the server-confirmed locale.
  const translations = getTranslations(locale);

  // ServerLocaleProvider commits document language/direction in a layout effect
  // when a server tree arrives. Keep this as an idempotent safeguard for initial
  // hydration and any future committed-locale update path.
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
   * Locale is a request/server authority, not an optimistic client preference.
   * Write the canonical cookie, then reload the current document so the new
   * request cannot inherit any RSC/prefetch entry created under the previous
   * locale. ServerLocaleProvider commits the returned locale + direction before
   * paint, so shell geometry and translated route content move as one unit.
   */
  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale || isLocalePending) return;
      requestLocale(newLocale);
      setPendingLocale(newLocale);
      window.location.reload();
    },
    [isLocalePending, locale],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir, isLocalePending };
}
