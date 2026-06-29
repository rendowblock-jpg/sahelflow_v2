"use client";

/**
 * ThemeProvider — minimal, hydration-safe theme provider.
 *
 * Replaces next-themes (which renders a <script> inside a React component,
 * triggering a React 19 / Next.js 16 Turbopack error:
 *   "Encountered a script tag while rendering React component.")
 *
 * The FOUC-prevention script is in src/app/layout.tsx (rendered as a raw
 * <script> in the server HTML head — the App Router pattern).
 *
 * This provider:
 *   1. Reads the theme from localStorage via useSyncExternalStore (no
 *      setState-in-effect lint error, SSR-safe)
 *   2. Provides useTheme() with the same API as next-themes:
 *      { theme, resolvedTheme, setTheme, themes }
 *   3. Persists to localStorage('theme') + toggles the 'dark' class on <html>
 *   4. Listens to system color-scheme changes when theme === 'system'
 *
 * Default theme: dark (matches the app's dark-first design).
 */

import { createContext, useContext, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";

export interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string; // accepted for compat (always "class")
  defaultTheme?: string; // "dark" | "light" | "system"
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

interface ThemeContextValue {
  theme: string;
  resolvedTheme: string;
  setTheme: (theme: string) => void;
  themes: string[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
  themes: ["light", "dark", "system"],
});

const STORAGE_KEY = "theme";
const DEFAULT_THEME = "dark";

// ── localStorage external store (for useSyncExternalStore) ───────────────────

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function getServerSnapshot(): string {
  return DEFAULT_THEME;
}

// ── System theme external store ──────────────────────────────────────────────

function subscribeSystem(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSystemSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getSystemServerSnapshot(): boolean {
  return true; // default dark
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  enableSystem = true,
}: ThemeProviderProps) {
  // Read theme from localStorage via useSyncExternalStore (SSR-safe, no
  // setState-in-effect lint error). Server snapshot = defaultTheme (matches
  // the FOUC script's default, so no hydration mismatch).
  const storedTheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemSnapshot, getSystemServerSnapshot);

  const theme = storedTheme || defaultTheme;
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Apply theme to <html> whenever it changes
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((newTheme: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
      // Dispatch a storage event so useSyncExternalStore picks it up
      // (the 'storage' event only fires in OTHER windows, not the current one)
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: newTheme }));
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      themes: enableSystem ? ["light", "dark", "system"] : ["light", "dark"],
    }),
    [theme, resolvedTheme, setTheme, enableSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** useTheme — same API as next-themes (theme, resolvedTheme, setTheme, themes). */
export function useTheme() {
  return useContext(ThemeContext);
}
