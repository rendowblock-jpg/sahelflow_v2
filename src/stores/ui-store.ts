/**
 * UI store — client-side UI state (locale, sidebar, theme).
 * Persisted to localStorage via Zustand persist middleware.
 * Also syncs locale to a cookie for server components.
 *
 * HYDRATION-SAFE DESIGN (the definitive fix):
 * The locale is NEVER persisted to localStorage. The cookie is the SINGLE
 * source of truth for locale — set by `setLocale()`, read by both the server
 * (layout.tsx) and the client (`getCookieLocale()`). This eliminates the
 * hydration mismatch that occurred when localStorage had a stale locale
 * (e.g. "fr" from a previous session) that differed from the cookie ("ar").
 *
 * Only `sidebarCollapsed` is persisted to localStorage (it's UI-only, no
 * server rendering depends on it, so no hydration risk).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

const VALID_LOCALES: readonly Locale[] = ["ar", "fr", "en"];

/**
 * Read the locale from the `sahelflow-locale` cookie.
 * Returns null on the server (no document) or if the cookie is missing/invalid.
 */
function getCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/sahelflow-locale=([^;]+)/);
  if (match && VALID_LOCALES.includes(match[1] as Locale)) {
    return match[1] as Locale;
  }
  return null;
}

interface UIState {
  locale: Locale;
  sidebarCollapsed: boolean;
  activeShopId: string | null;

  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveShopId: (shopId: string | null) => void;
}

function setLocaleCookie(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.cookie = `sahelflow-locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Read from cookie to match SSR (the server reads the same cookie).
      // This is the ONLY source of truth for locale — localStorage is NOT
      // used for locale (see partialize below).
      locale: getCookieLocale() ?? "fr",
      sidebarCollapsed: false,
      activeShopId: null,

      setLocale: (locale) => {
        setLocaleCookie(locale);
        set({ locale });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActiveShopId: (shopId) => set({ activeShopId: shopId }),
    }),
    {
      name: "sahelflow-ui",
      // ONLY persist sidebarCollapsed to localStorage. Locale is NOT persisted —
      // the cookie is the source of truth (set by setLocale, read by server +
      // client). Persisting locale to localStorage caused hydration mismatches
      // when the localStorage value differed from the cookie value.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      // merge: always keep the cookie-based locale (currentState), never override
      // it with anything from localStorage. This is the critical fix.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<UIState> | null;
        return {
          ...currentState,
          ...persisted,
          // ALWAYS keep the cookie-based locale — never use the persisted one.
          // This prevents the hydration mismatch where localStorage "fr" overrode
          // the cookie "ar" on the first client render.
          locale: currentState.locale,
        };
      },
    },
  ),
);
