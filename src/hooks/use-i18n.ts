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

/**
 * Treat a locale switch as one visual snapshot instead of letting text, shell
 * direction and workspace geometry repaint independently. View Transitions are
 * already supported by the packaged Chromium/WebView runtime; reduced-motion
 * users and older browsers keep the same immediate atomic commit.
 */
function commitLocaleViewTransition(update: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    update();
    return;
  }

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const startViewTransition =
    typeof document.startViewTransition === "function"
      ? document.startViewTransition.bind(document)
      : null;

  if (reducedMotion || !startViewTransition) {
    update();
    return;
  }

  let committed = false;
  const commitOnce = () => {
    if (committed) return;
    committed = true;
    update();
  };

  try {
    const transition = startViewTransition(commitOnce);
    void transition.finished.catch(() => undefined);
  } catch {
    commitOnce();
  }
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
  // copy and geometry therefore move in the same committed snapshot; the refreshed
  // server tree reconciles server-rendered fragments afterward.
  const translations = getTranslations(locale);

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
  // Hard reload remains recovery only; normal switching reconciles in place.
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
   * Locale switching is one client visual transaction followed by server
   * reconciliation: persist request → snapshot/commit live copy + direction →
   * refresh RSC → clear pending when both authorities agree.
   */
  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale || isLocalePending) return;

      beginLocaleVisualTransition(newLocale);
      requestLocale(newLocale);
      setPendingLocale(newLocale);
      commitLocaleViewTransition(() => {
        commitLocale(newLocale);
      });

      startRefreshTransition(() => {
        router.refresh();
      });
    },
    [commitLocale, isLocalePending, locale, router],
  );

  const dir = useMemo(() => getDirection(locale), [locale]);
  return { t, locale, setLocale, dir, isLocalePending };
}
