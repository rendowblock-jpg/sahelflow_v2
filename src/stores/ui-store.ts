/**
 * UI store — client-side UI state (committed locale mirror, sidebar, density).
 * Persisted to localStorage via Zustand persist middleware.
 *
 * LOCALE COMMIT MODEL:
 * The `sahelflow-locale` cookie is the durable request/server authority. An
 * interactive locale choice writes that cookie first, but does not immediately
 * mutate document direction or hydrated copy. The refreshed Server Component
 * tree returns with the requested locale and `ServerLocaleProvider` commits that
 * server-confirmed locale to this mirror plus `<html lang/dir>` before paint.
 *
 * This prevents the previous split state where client navigation/RTL flipped
 * while server-translated route content still belonged to the old request.
 * `sidebarCollapsed` and `density` remain UI-only persisted preferences.
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

  /** Commit a locale that the current Server Component tree already represents. */
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
 * Request a locale for the next Server Component tree without changing the
 * currently committed client geometry/copy. Call `router.refresh()` immediately
 * after this from the interaction boundary.
 */
export function requestLocale(locale: Locale): void {
  setLocaleCookie(locale);
}

/** Apply one already-committed server locale to the browser document boundary. */
function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = getDirection(locale);
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial client mirror matches the same cookie read by server layouts.
      locale: getCookieLocale() ?? "fr",
      sidebarCollapsed: false,
      density: "comfortable",
      activeShopId: null,

      setLocale: (locale) => {
        // This is a commit operation: ServerLocaleProvider calls it only after
        // the refreshed server tree already represents `locale`.
        setLocaleCookie(locale);
        applyDocumentLocale(locale);
        set((state) => (state.locale === locale ? state : { ...state, locale }));
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
      // Locale never comes from persisted localStorage. The cookie/server tree
      // owns it; this store only mirrors the currently committed server locale.
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
