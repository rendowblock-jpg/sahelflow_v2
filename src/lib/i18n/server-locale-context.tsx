"use client";

/**
 * ServerLocaleContext — passes the server-determined locale to client components.
 *
 * WHY: The Zustand ui-store calls getCookieLocale() which returns null on the
 * server (no document). So the store defaults to "fr" on the server, but reads
 * the actual cookie ("ar") on the client → useI18n() returns different values
 * on server vs client → HYDRATION MISMATCH.
 *
 * FIX: The Server Component layout reads the cookie via next/headers and passes
 * the locale to this Provider. useI18n() reads from this context for the INITIAL
 * render (matching the server), then switches to the store locale after mount.
 */

import { createContext, useContext } from "react";
import type { Locale } from "./index";

const ServerLocaleContext = createContext<Locale>("fr");

/** The default export Provider — wrap the app in this from a Server Component layout. */
export function ServerLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <ServerLocaleContext.Provider value={locale}>
      {children}
    </ServerLocaleContext.Provider>
  );
}

/** Read the server-determined locale (for hydration-safe initial render). */
export function useServerLocale(): Locale {
  return useContext(ServerLocaleContext);
}
