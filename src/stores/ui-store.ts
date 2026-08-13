/**
 * UI store — client-side UI state (committed locale mirror, sidebar, density).
 * Persisted to localStorage via Zustand persist middleware.
 *
 * LOCALE COMMIT MODEL:
 * The `sahelflow-locale` cookie is the durable request/server authority. An
 * interactive locale choice writes that cookie first, but does not immediately
 * mutate document direction or hydrated copy. The interaction then performs a
 * full-document reload so no Next client router/prefetch entry from the previous
 * locale survives. The returned Server Component tree carries the requested
 * locale and `ServerLocaleProvider` commits that server-confirmed locale to this
 * mirror plus `<html lang/dir>` before paint.
 *
 * This prevents the previous split state where client navigation/RTL flipped
 * while server-translated route content still belonged to the old request.
 * `sidebarCollapsed` and `density` remain UI-only persisted preferences.
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

/**
 * Preference persistence is deliberately best-effort. Desktop/WebView storage
 * can be readable but unwritable (quota-full, policy-restricted, read-only). A
 * failed preference write must never abort locale/server-tree commit, startup,
 * or an operational interaction; the in-memory UI authority remains valid for
 * the current session and persistence can recover on a later write.
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
 * currently committed client geometry/copy. The interaction boundary must follow
 * this with a full-document navigation/reload so stale client router prefetch
 * entries cannot survive the locale authority transition.
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
      density: DEFAULT_UI_DENSITY,
      activeShopId: null,

      setLocale: (locale) => {
        // This is a commit operation: the request cookie already selected the
        // Server Component tree. Do not create a second durable locale write here.
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
      storage: createJSONStorage(() => bestEffortUiStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
      }),
      // Persisted UI data is untrusted/stale input. Admit only the two known
      // preferences and normalize everything else to safe current defaults.
      // Locale and active shop never come from this storage boundary.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as {
          sidebarCollapsed?: unknown;
          density?: unknown;
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
          locale: currentState.locale,
          activeShopId: currentState.activeShopId,
        };
      },
    },
  ),
);
