/**
 * Worker-side stand-in for src/components/storefront/storefront-locale-provider.tsx.
 *
 * The shared storefront renderer imports that module by name. In the desktop app
 * it reads the buyer locale from React state, the dashboard i18n store and the
 * Next router. None of that exists in a Cloudflare Worker, and importing it would
 * drag the whole dashboard dictionary into the bundle. wrangler's `alias` setting
 * (see wrangler.jsonc.example) swaps this file in at build time, so the renderer
 * is the SAME code on the Studio canvas and on the public page.
 *
 * The exported surface must stay assignable to the real one;
 * provider-contract.test.ts checks that at compile time.
 */
import { createContext, useContext, useMemo } from "react";

import { directionOf, type PublicLocale } from "../locale";
import { createPublicTranslator, type PublicTranslator } from "../translator";

export interface StorefrontI18n {
  t: PublicTranslator;
  locale: PublicLocale;
  dir: "ltr" | "rtl";
  setLocale: (locale: PublicLocale) => void;
  isLocalePending: boolean;
}

const StorefrontLocaleContext = createContext<StorefrontI18n | null>(null);

export function StorefrontLocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: PublicLocale;
  children: React.ReactNode;
}) {
  const value = useMemo<StorefrontI18n>(
    () => ({
      t: createPublicTranslator(initialLocale),
      locale: initialLocale,
      dir: directionOf(initialLocale),
      // The page is server-rendered; switching language is a plain link (?lang=).
      setLocale: () => undefined,
      isLocalePending: false,
    }),
    [initialLocale],
  );
  return (
    <StorefrontLocaleContext.Provider value={value}>
      <div
        dir={value.dir}
        lang={value.locale}
        data-storefront-locale={value.locale}
        data-storefront-dir={value.dir}
        className="min-h-full"
      >
        {children}
      </div>
    </StorefrontLocaleContext.Provider>
  );
}

export function useStorefrontI18n(): StorefrontI18n {
  const value = useContext(StorefrontLocaleContext);
  if (!value) throw new Error("useStorefrontI18n needs a StorefrontLocaleProvider");
  return value;
}
