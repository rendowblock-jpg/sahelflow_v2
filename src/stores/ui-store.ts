/**
 * UI store — client-side UI state (locale, sidebar, theme).
 * Persisted to localStorage via Zustand persist middleware.
 * Also syncs locale to a cookie for server components.
 *
 * ANTI-FLASH DESIGN:
 * The store's initial locale is read from the `sahelflow-locale` cookie on the
 * client side (not from localStorage). This ensures the FIRST client render
 * matches the server render (which also reads the cookie), eliminating the
 * French→Arabic flash. Zustand persist then rehydrates from localStorage —
 * if the value differs (rare edge case), the store updates silently.
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
      // On the client: read from cookie to match SSR (eliminates flash).
      // On the server: falls back to "fr" (the server default).
      // Zustand persist will override this with localStorage after hydration,
      // but in normal usage cookie + localStorage always agree (setLocale sets both).
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
      partialize: (state) => ({
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      // Custom merge: prefer persisted state, but only if it's a valid locale.
      // This handles the edge case where localStorage has a stale/invalid value.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<UIState> | null;
        const persistedLocale = persisted?.locale;
        const validPersistedLocale =
          persistedLocale && VALID_LOCALES.includes(persistedLocale)
            ? persistedLocale
            : undefined;
        return {
          ...currentState,
          ...persisted,
          // If persisted locale is invalid, keep the cookie-based initial value
          locale: validPersistedLocale ?? currentState.locale,
        };
      },
    },
  ),
);
