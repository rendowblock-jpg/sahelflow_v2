"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  getDirection,
  getTranslations,
  stabilizeBidiText,
  type Locale,
} from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { useServerLocale } from "@/lib/i18n/server-locale-context";
import { requestLocale, useUIStore } from "@/stores/ui-store";

const LOCALE_REFRESH_FALLBACK_MS = 8_000;

function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function beginLocaleVisualTransition(target: Locale): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.localeTransition = "pending";
  root.dataset.localeTarget = target;
  root.setAttribute("aria-busy", "true");
}

function clearLocaleVisualTransition(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  delete root.dataset.localeTransition;
  delete root.dataset.localeTarget;
  root.removeAttribute("aria-busy");
}

export function useI18n() {
  const router = useRouter();
  const serverLocale = useServerLocale();
  const storeLocale = useUIStore((state) => state.locale);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [refreshPending, startRefreshTransition] = useTransition();
  const mounted = useIsMounted();
  const locale = mounted ? storeLocale : serverLocale;
  const localeCommitPending =
    pendingLocale !== null &&
    (serverLocale !== pendingLocale || storeLocale !== pendingLocale);
  const isLocalePending = localeCommitPending || refreshPending;

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

  // The provider clears the visual transition in a layout effect before the
  // refreshed tree paints. Keep an idempotent external-system cleanup here once
  // both locale authorities expose the exact requested server commit. The target
  // state itself is intentionally derived instead of synchronously reset inside
  // an effect, avoiding a cascading render after every successful switch.
  useEffect(() => {
    if (pendingLocale !== null && !localeCommitPending) {
      clearLocaleVisualTransition();
    }
  }, [localeCommitPending, pendingLocale]);

  // A failed/aborted RSC refresh must never leave the shell permanently covered
  // or direction controls locked. The hard reload is recovery only, not the
  // normal language-switch path.
  useEffect(() => {
    if (!localeCommitPending) return;
    const timeout = window.setTimeout(() => {
      window.location.reload();
    }, LOCALE_REFRESH_FALLBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [localeCommitPending]);

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
      return stabilizeBidiText(value, locale);
    },
    [translations, locale],
  );

  /**
   * Locale is request/server authority, not an optimistic preference. The
   * current tree remains visually frozen behind a short neutral transition,
   * then router.refresh() clears the current Next client route cache and fetches
   * a new Server Component payload under the requested cookie. The returned
   * ServerLocaleProvider commits copy + lang + direction in a layout effect, so
   * the user never sees a mixed LTR/RTL tree and the app keeps desktop state
   * instead of performing a normal full-document restart.
   */
  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale || isLocalePending) return;

      beginLocaleVisualTransition(newLocale);
      requestLocale(newLocale);
      setPendingLocale(newLocale);

      startRefreshTransition(() => {
        router.refresh();
      });
    },
    [isLocalePending, locale, router],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir, isLocalePending };
}
