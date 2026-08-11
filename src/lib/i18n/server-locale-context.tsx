"use client";

/**
 * ServerLocaleContext — carries the locale of the currently committed Server
 * Component tree into hydrated client components.
 *
 * Interactive locale changes are requested through the cookie first, but client
 * copy and direction remain on the old committed tree while `router.refresh()`
 * is pending. When the refreshed server tree arrives, this provider receives the
 * exact locale that rendered that tree and commits it to the client mirror in a
 * layout effect before the browser paints. Server-rendered route copy, client
 * translations and shell geometry therefore move together.
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
