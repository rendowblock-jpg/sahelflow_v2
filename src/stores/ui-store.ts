/**
 * UI store — client-side UI state (locale, sidebar, density).
 * Persisted to localStorage via Zustand persist middleware.
 * Also syncs locale to a cookie for server components.
 *
 * HYDRATION-SAFE DESIGN:
 * Locale is NEVER persisted to localStorage. The cookie is the single durable
 * source of truth for locale — set by `setLocale()`, read by both the server
 * (layout.tsx) and the client (`getCookieLocale()`). The client store mirrors it
 * so language + direction can react immediately without waiting for an RSC refresh.
 *
 * `sidebarCollapsed` and `density` are UI-only preferences and are safe to persist
 * to localStorage because server rendering does not depend on them.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getDirection, type Locale } from "@/lib/i18n";

const VALID_LOCALES: readonly Locale[] = ["ar", "fr", "en"];

export type UiDensity = "comfortable" | "compact";

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
  density: UiDensity;
  activeShopId: string | null;

  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDensity: (density: UiDensity) => void;
  setActiveShopId: (shopId: string | null) => void;
}

function setLocaleCookie(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.cookie = `sahelflow-locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  }
}

/**
 * Apply the language boundary synchronously before React subscribers re-render.
 * This keeps document language, document direction and the client locale store on
 * the same transition instead of letting direction lag in an effect.
 */
function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = getDirection(locale);
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Read from cookie to match SSR. This is the only durable locale authority.
      locale: getCookieLocale() ?? "fr",
      sidebarCollapsed: false,
      density: "comfortable",
      activeShopId: null,

      setLocale: (locale) => {
        setLocaleCookie(locale);
        applyDocumentLocale(locale);
        set({ locale });
      },
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setDensity: (density) => set({ density }),
      setActiveShopId: (shopId) => set({ activeShopId: shopId }),
    }),
    {
      name: "sahelflow-ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
      }),
      // Always keep the cookie-derived locale from currentState. Persisted UI
      // preferences may merge around it, but localStorage can never override it.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<UIState> | null;
        return {
          ...currentState,
          ...persisted,
          locale: currentState.locale,
        };
      },
    },
  ),
);
