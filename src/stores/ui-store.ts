/**
 * UI store — client-side UI state (locale, sidebar, theme).
 * Persisted to localStorage via Zustand persist middleware.
 * Also syncs locale to a cookie for server components.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

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
      locale: "fr",
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
    },
  ),
);
