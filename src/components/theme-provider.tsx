"use client";

/**
 * ThemeProvider — hydration-safe SahelFlow theme authority.
 *
 * The pre-hydration script lives in src/app/layout.tsx. This provider owns every
 * interactive theme read/write after hydration; product surfaces must import
 * `useTheme` from this module rather than creating a second next-themes context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string; // accepted for compatibility; SahelFlow uses class authority
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: string) => void;
  themes: ThemeMode[];
}

const STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "sahelflow:theme-change";
const DEFAULT_THEME: ThemeMode = "dark";

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  setTheme: () => {},
  themes: ["light", "dark", "system"],
});

function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_THEME;
}

function resolveTheme(theme: ThemeMode, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;
}

// ── localStorage external store ──────────────────────────────────────────────

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const notify = () => callback();
  window.addEventListener("storage", notify);
  window.addEventListener(THEME_CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(THEME_CHANGE_EVENT, notify);
  };
}

function getSnapshot(): ThemeMode {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function getServerSnapshot(): ThemeMode {
  return DEFAULT_THEME;
}

// ── System theme external store ──────────────────────────────────────────────

function subscribeSystem(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSystemSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getSystemServerSnapshot(): boolean {
  return true;
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  enableSystem = true,
}: ThemeProviderProps) {
  const storedTheme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    getSystemSnapshot,
    getSystemServerSnapshot,
  );

  const theme = storedTheme || normalizeTheme(defaultTheme);
  const resolvedTheme = resolveTheme(theme, systemDark);

  // Reconcile initial hydration and operating-system scheme changes.
  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: string) => {
    const normalized = normalizeTheme(newTheme);
    try {
      // Apply the visual state before notifying React subscribers. This prevents
      // a render frame where controls report the new mode while <html> still uses
      // the previous palette.
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyResolvedTheme(resolveTheme(normalized, systemPrefersDark));
      localStorage.setItem(STORAGE_KEY, normalized);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    } catch {
      // Theme persistence is a preference; failure must never block the workspace.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      themes: enableSystem
        ? ["light", "dark", "system"]
        : ["light", "dark"],
    }),
    [theme, resolvedTheme, setTheme, enableSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
