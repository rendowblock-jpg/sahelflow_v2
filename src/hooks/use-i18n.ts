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
  const commitLocale = useUIStore((state) => state.setLocale);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [refreshPending, startRefreshTransition] = useTransition();
  const mounted = useIsMounted();
  const locale = mounted ? storeLocale : serverLocale;
  const localeCommitPending =
    pendingLocale !== null &&
    (serverLocale !== pendingLocale || storeLocale !== pendingLocale);
  const isLocalePending = localeCommitPending || refreshPending;

  // All three compact product bundles are synchronously available. Client-owned
  // copy and geometry can therefore move in one render as soon as a locale is
  // requested; the refreshed server tree reconciles server-rendered fragments.
  const translations = getTranslations(locale);

  // Keep the document boundary idempotently aligned with the client locale. The
  // UI store performs the synchronous event-boundary commit; this effect covers
  // hydration and any future external locale reconciliation path.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  // ServerLocaleProvider clears the transition in a layout effect when the new
  // RSC tree arrives. Keep this idempotent cleanup once both authorities agree.
  useEffect(() => {
    if (pendingLocale !== null && !localeCommitPending) {
      clearLocaleVisualTransition();
    }
  }, [localeCommitPending, pendingLocale]);

  // A failed/aborted RSC refresh must never leave the locale request unresolved.
  // The hard reload is recovery only; normal switching commits the client shell
  // immediately and reconciles the server tree in place.
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
   * Locale switching is one client transaction followed by server reconciliation:
   * 1. persist the request cookie for the next server render;
   * 2. commit the client locale immediately so shell geometry and client copy do
   *    not wait on network/RSC latency;
   * 3. refresh the current Server Component tree under the requested cookie;
   * 4. clear the pending state when ServerLocaleProvider confirms the same locale.
   *
   * This removes the historical restart-only/stale-side failure while preserving
   * the cookie as durable request authority.
   */
  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale || isLocalePending) return;

      beginLocaleVisualTransition(newLocale);
      requestLocale(newLocale);
      setPendingLocale(newLocale);
      commitLocale(newLocale);

      startRefreshTransition(() => {
        router.refresh();
      });
    },
    [commitLocale, isLocalePending, locale, router],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir, isLocalePending };
}
