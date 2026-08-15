"use client";

/**
 * ServerLocaleContext — carries the locale of the currently committed Server
 * Component tree into hydrated client components.
 *
 * Interactive locale changes commit the client mirror immediately so translated
 * client surfaces and shell geometry do not wait on RSC/network latency. The
 * request cookie remains durable server authority. When router.refresh() returns,
 * this provider receives the exact locale that rendered the new Server Component
 * tree and reconciles the client mirror in a layout effect before paint.
 */

import { createContext, useContext, useLayoutEffect } from "react";
import type { Locale } from "./index";
import { useUIStore } from "@/stores/ui-store";

const ServerLocaleContext = createContext<Locale>("fr");

export function ServerLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const commitLocale = useUIStore((state) => state.setLocale);

  useLayoutEffect(() => {
    commitLocale(locale);

    // The lightweight pending indicator remains until this exact server locale
    // confirms the request. Clear it in the same pre-paint phase as reconciliation
    // so the user never sees a completed transition with a stale server fragment.
    const root = document.documentElement;
    if (root.dataset.localeTarget === locale) {
      delete root.dataset.localeTransition;
      delete root.dataset.localeTarget;
      root.removeAttribute("aria-busy");
    }
  }, [commitLocale, locale]);

  return (
    <ServerLocaleContext.Provider value={locale}>
      {children}
    </ServerLocaleContext.Provider>
  );
}

/** Read the locale used to render the current Server Component tree. */
export function useServerLocale(): Locale {
  return useContext(ServerLocaleContext);
}
