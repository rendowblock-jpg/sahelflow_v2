/**
 * UI store — client-side UI state (live locale mirror + seller UI preferences).
 * Persisted to localStorage via Zustand persist middleware.
 *
 * LOCALE COMMIT MODEL:
 * The `sahelflow-locale` cookie is durable request/server authority. An
 * interactive locale choice writes that cookie and immediately commits the live
 * client locale so hydrated copy, shell geometry and `<html lang/dir>` move in
 * the same interaction instead of waiting on network/RSC latency. The current
 * route is then refreshed under the new cookie; ServerLocaleProvider reconciles
 * the returned Server Component tree before paint. A hard document reload is
 * recovery-only if server reconciliation cannot converge.
 *
 * Locale and active shop never persist in this Zustand storage. Sidebar collapse,
 * density and navigation domain order are presentation-only preferences.
 */
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { getDirection, type Locale } from "@/lib/i18n";

const VALID_LOCALES: readonly Locale[] = ["ar", "fr", "en"];

export type UiDensity = "comfortable" | "compact";
export const DEFAULT_UI_DENSITY: UiDensity = "comfortable";

function isUiDensity(value: unknown): value is UiDensity {
  return value === "comfortable" || value === "compact";
}

function isNavigationOrder(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    value.every(
      (entry) =>
        typeof entry === "string" && entry.length > 0 && entry.length <= 64,
    )
  );
}

/**
 * Preference persistence is deliberately best-effort. Desktop/WebView storage
 * can be readable but unwritable (quota-full, policy-restricted, read-only). A
 * failed preference write must never abort locale/server-tree reconciliation,
 * startup, or an operational interaction; the in-memory UI authority remains
 * valid for the current session and persistence can recover on a later write.
 */
const bestEffortUiStorage: StateStorage = {
  getItem(name) {
    try {
      return globalThis.localStorage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      globalThis.localStorage?.setItem(name, value);
    } catch {
      // Preference durability is non-critical; keep the live in-memory state.
    }
  },
  removeItem(name) {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      // A failed cleanup must not destabilize the application shell.
    }
  },
};

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
  navigationDomainOrder: string[];
  activeShopId: string | null;

  /** Commit the live client locale and browser document boundary. */
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDensity: (density: UiDensity) => void;
  setNavigationDomainOrder: (order: string[]) => void;
  resetNavigationDomainOrder: () => void;
  setActiveShopId: (shopId: string | null) => void;
}

function setLocaleCookie(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.cookie = `sahelflow-locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  }
}

/** Select the locale that the next Server Component request must render. */
export function requestLocale(locale: Locale): void {
  setLocaleCookie(locale);
}

/** Apply the live locale to the browser document boundary. */
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
      density: DEFAULT_UI_DENSITY,
      navigationDomainOrder: [],
      activeShopId: null,

      setLocale: (locale) => {
        // The cookie is written by requestLocale(). This commits only the live
        // presentation mirror/document so client geometry can switch immediately.
        applyDocumentLocale(locale);
        set((state) => (state.locale === locale ? state : { ...state, locale }));
      },
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setDensity: (density) => set({ density }),
      setNavigationDomainOrder: (order) =>
        set({ navigationDomainOrder: [...order] }),
      resetNavigationDomainOrder: () => set({ navigationDomainOrder: [] }),
      setActiveShopId: (shopId) => set({ activeShopId: shopId }),
    }),
    {
      name: "sahelflow-ui",
      storage: createJSONStorage(() => bestEffortUiStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
        navigationDomainOrder: state.navigationDomainOrder,
      }),
      // Persisted UI data is untrusted/stale input. Admit only bounded known
      // preference shapes. Canonical navigation reconciliation happens against
      // the live registry, so an older preference cannot hide new destinations.
      // Locale and active shop never come from this storage boundary.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as {
          sidebarCollapsed?: unknown;
          density?: unknown;
          navigationDomainOrder?: unknown;
        } | null;
        return {
          ...currentState,
          sidebarCollapsed:
            typeof persisted?.sidebarCollapsed === "boolean"
              ? persisted.sidebarCollapsed
              : currentState.sidebarCollapsed,
          density: isUiDensity(persisted?.density)
            ? persisted.density
            : DEFAULT_UI_DENSITY,
          navigationDomainOrder: isNavigationOrder(
            persisted?.navigationDomainOrder,
          )
            ? persisted.navigationDomainOrder
            : [],
          locale: currentState.locale,
          activeShopId: currentState.activeShopId,
        };
      },
    },
  ),
);