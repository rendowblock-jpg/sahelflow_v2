"use client";

/**
 * ThemeProvider — hydration-safe SahelFlow appearance authority.
 *
 * The pre-hydration script lives in src/app/layout.tsx. This provider owns every
 * interactive color-mode and coordinated theme-preset read/write after hydration;
 * product surfaces must import `useTheme` from this module rather than creating a
 * second next-themes context or writing appearance preferences directly.
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

export type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "sahel" | "atlas" | "oasis" | "dune";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  preset: ThemePreset;
  setTheme: (theme: string) => void;
  setPreset: (preset: ThemePreset) => void;
  themes: ThemeMode[];
  presets: ThemePreset[];
}

const STORAGE_KEY = "theme";
const PRESET_STORAGE_KEY = "sahelflow-theme-preset";
const THEME_CHANGE_EVENT = "sahelflow:theme-change";
const DEFAULT_THEME: ThemeMode = "dark";
const DEFAULT_PRESET: ThemePreset = "sahel";
const PRESETS: ThemePreset[] = ["sahel", "atlas", "oasis", "dune"];
let transitionTimer: number | undefined;

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  preset: DEFAULT_PRESET,
  setTheme: () => {},
  setPreset: () => {},
  themes: ["light", "dark", "system"],
  presets: PRESETS,
});

function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_THEME;
}

function normalizePreset(value: string | null | undefined): ThemePreset {
  return value === "atlas" || value === "oasis" || value === "dune"
    ? value
    : DEFAULT_PRESET;
}

function resolveTheme(theme: ThemeMode, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

function beginAppearanceTransition(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.documentElement;
  root.dataset.themeSwitching = "true";
  if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(() => {
    delete root.dataset.themeSwitching;
    transitionTimer = undefined;
  }, 220);
}

function applyAppearance(
  resolvedTheme: ResolvedTheme,
  preset: ThemePreset,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.dataset.themePreset = preset;
  root.style.colorScheme = resolvedTheme;
}

// ── localStorage external stores ─────────────────────────────────────────────

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

function getThemeSnapshot(): ThemeMode {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function getThemeServerSnapshot(): ThemeMode {
  return DEFAULT_THEME;
}

function getPresetSnapshot(): ThemePreset {
  try {
    return normalizePreset(localStorage.getItem(PRESET_STORAGE_KEY));
  } catch {
    return DEFAULT_PRESET;
  }
}

function getPresetServerSnapshot(): ThemePreset {
  return DEFAULT_PRESET;
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
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const preset = useSyncExternalStore(
    subscribe,
    getPresetSnapshot,
    getPresetServerSnapshot,
  );
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    getSystemSnapshot,
    getSystemServerSnapshot,
  );

  const theme = storedTheme || normalizeTheme(defaultTheme);
  const resolvedTheme = resolveTheme(theme, systemDark);

  // Reconcile initial hydration, preset storage events and OS scheme changes.
  useEffect(() => {
    applyAppearance(resolvedTheme, preset);
  }, [resolvedTheme, preset]);

  const setTheme = useCallback((newTheme: string) => {
    const normalized = normalizeTheme(newTheme);
    try {
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      beginAppearanceTransition();
      applyAppearance(
        resolveTheme(normalized, systemPrefersDark),
        getPresetSnapshot(),
      );
      localStorage.setItem(STORAGE_KEY, normalized);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    } catch {
      // Appearance persistence is a preference; failure must not block work.
    }
  }, []);

  const setPreset = useCallback((newPreset: ThemePreset) => {
    const normalized = normalizePreset(newPreset);
    try {
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      beginAppearanceTransition();
      applyAppearance(
        resolveTheme(getThemeSnapshot(), systemPrefersDark),
        normalized,
      );
      localStorage.setItem(PRESET_STORAGE_KEY, normalized);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    } catch {
      // Appearance persistence is a preference; failure must not block work.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      preset,
      setTheme,
      setPreset,
      themes: enableSystem
        ? ["light", "dark", "system"]
        : ["light", "dark"],
      presets: PRESETS,
    }),
    [theme, resolvedTheme, preset, setTheme, setPreset, enableSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
