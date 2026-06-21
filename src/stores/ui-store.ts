/**
 * UI store — client-side UI state (locale, sidebar, theme).
 * Persisted to localStorage via Zustand persist middleware.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

interface UIState {
  /** Active locale (ar | fr | en) */
  locale: Locale;
  /** Sidebar collapsed state (for desktop) */
  sidebarCollapsed: boolean;
  /** Active shop ID (for multi-shop selector) */
  activeShopId: string | null;

  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveShopId: (shopId: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      locale: "fr",
      sidebarCollapsed: false,
      activeShopId: null,

      setLocale: (locale) => set({ locale }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setActiveShopId: (shopId) => set({ activeShopId: shopId }),
    }),
    {
      name: "sahelflow-ui",
      // Only persist locale + sidebar state, not ephemeral shop ID
      partialize: (state) => ({
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
