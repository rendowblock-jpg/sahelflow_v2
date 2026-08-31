"use client";

/**
 * Buyer storefront locale provider (R4-c).
 *
 * The public storefront resolves its OWN buyer locale server-side
 * (?lang= > sf-storefront-locale cookie > Accept-Language > fr) and hands it
 * here as `initialLocale`. This provider then:
 *   - holds the live buyer locale in client state so an explicit switch
 *     flips translated copy in ONE render (all three bundles are statically
 *     linked — no chunk wait), before the RSC refresh reconciles;
 *   - renders the dir/lang boundary wrapper so buyer geometry is correct at
 *     FIRST PAINT even while <html dir> still carries the seller cookie
 *     (a nested route cannot change <html> attributes at SSR time);
 *   - aligns <html lang/dir> with the buyer locale after hydration — the
 *     storefront document belongs to the buyer, not the seller session;
 *   - nests the Radix Direction provider so portal primitives inside the
 *     storefront (dropdowns, dialogs) follow the buyer direction instead of
 *     the dashboard AppDirectionProvider value;
 *   - persists explicit buyer switches in the SEPARATE `sf-storefront-locale`
 *     cookie (never `sahelflow-locale` — dashboard and storefront must not
 *     fight over one authority).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Direction } from "radix-ui";

import { useI18n } from "@/hooks/use-i18n";
import { getDirection, type Locale } from "@/lib/i18n";
import {
  createStorefrontTranslator,
  getStorefrontDirection,
  storefrontLocaleCookieAssignment,
  STOREFRONT_LOCALE_QUERY_PARAM,
  type StorefrontTranslator,
} from "@/lib/i18n/storefront-locale";

export interface StorefrontI18n {
  t: StorefrontTranslator;
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  isLocalePending: boolean;
}

const StorefrontLocaleContext = createContext<StorefrontI18n | null>(null);

interface StorefrontLocaleProviderProps {
  /** Buyer locale resolved by the storefront RSC for the current request. */
  initialLocale: Locale;
  children: React.ReactNode;
}

export function StorefrontLocaleProvider({
  initialLocale,
  children,
}: StorefrontLocaleProviderProps) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [refreshPending, startRefreshTransition] = useTransition();

  // Adopt the server-resolved buyer locale whenever the RSC tree re-renders
  // under a new resolution (?lang= link navigation). Explicit client switches
  // commit first, so the refreshed tree arrives with the same value and this
  // is a no-op reconciliation — mirroring ServerLocaleProvider's contract.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile the server-resolved buyer locale after an RSC refresh (cookie commit or ?lang navigation)
    setLocaleState(initialLocale);
  }, [initialLocale]);

  // The buyer locale owns the document boundary on the storefront route.
  // Parent effects run after child effects, so this wins over any dashboard
  // useI18n mount inside the tree, and re-runs on every buyer switch.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getDirection(locale);
  }, [locale]);

  /**
   * Explicit buyer switch: one client transaction + server reconciliation.
   * 1. persist the choice in the storefront-only cookie (durable authority);
   * 2. commit the live locale immediately (copy is statically bundled);
   * 3. drop any `?lang=` override and refresh so the server tree, URL and
   *    cookie agree — the cookie wins from here on.
   */
  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      document.cookie = storefrontLocaleCookieAssignment(next);
      setLocaleState(next);
      startRefreshTransition(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.has(STOREFRONT_LOCALE_QUERY_PARAM)) {
          url.searchParams.delete(STOREFRONT_LOCALE_QUERY_PARAM);
          const query = url.searchParams.toString();
          router.replace(
            query ? `${url.pathname}?${query}` : url.pathname,
            { scroll: false },
          );
        } else {
          router.refresh();
        }
      });
    },
    [locale, router],
  );

  const t = useMemo(() => createStorefrontTranslator(locale), [locale]);
  const dir = getStorefrontDirection(locale);

  const value = useMemo<StorefrontI18n>(
    () => ({ t, locale, dir, setLocale, isLocalePending: refreshPending }),
    [t, locale, dir, setLocale, refreshPending],
  );

  return (
    <StorefrontLocaleContext.Provider value={value}>
      {/*
        Radix portals inside the storefront must follow the BUYER direction.
        The nested Direction provider overrides the dashboard
        AppDirectionProvider for this subtree without touching it.
      */}
      <Direction.Provider dir={dir}>
        {/*
          SSR dir boundary: <html dir> still carries the seller cookie (a
          nested route cannot change it), so the storefront wrapper carries
          the buyer direction itself. Logical CSS properties, `rtl:` variants
          and the [data-storefront-locale] typography rules resolve against
          this wrapper from first paint.
        */}
        <div
          dir={dir}
          lang={locale}
          data-storefront-locale={locale}
          data-storefront-dir={dir}
          className="min-h-full"
        >
          {children}
        </div>
      </Direction.Provider>
    </StorefrontLocaleContext.Provider>
  );
}

/**
 * Buyer-facing i18n hook for the storefront surface.
 *
 * Under the public storefront this reads the buyer locale context. In the
 * Studio preview (no provider mounted) it transparently falls back to the
 * dashboard locale transaction, so the shared renderer keeps its current
 * seller-facing behavior without any studio change.
 */
export function useStorefrontI18n(): StorefrontI18n {
  const storefront = useContext(StorefrontLocaleContext);
  const dashboard = useI18n();
  if (storefront) return storefront;
  return {
    t: dashboard.t,
    locale: dashboard.locale,
    dir: dashboard.dir,
    setLocale: dashboard.setLocale,
    isLocalePending: dashboard.isLocalePending,
  };
}
