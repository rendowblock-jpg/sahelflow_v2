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

// A WebView can deny/quota-fail localStorage while the application is otherwise
// healthy. These bounded in-memory overrides keep context state and the DOM under
// one authority for the current session when persistence is unavailable. A later
// successful write or an external storage event releases the relevant override.
let runtimeThemeOverride: ThemeMode | null = null;
let runtimePresetOverride: ThemePreset | null = null;

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

function beginAppearanceTransaction(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appearanceTransition = "active";
}

function endAppearanceTransaction(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.appearanceTransition;
}

function finishAppearanceTransactionOnNextPaint(): void {
  if (typeof window === "undefined") {
    endAppearanceTransaction();
    return;
  }
  window.requestAnimationFrame(() => endAppearanceTransaction());
}

/**
 * Commit one complete appearance snapshot. Every descendant CSS transition is
 * temporarily frozen while mode/preset tokens change, preventing the patchwork
 * "some panels changed first" frame seen in the installed Internal.16 build.
 * Modern WebView2/Chromium then cross-fades the root snapshot as one surface.
 */
function commitAppearanceTransition(update: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    update();
    return;
  }

  beginAppearanceTransaction();

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const startViewTransition =
    typeof document.startViewTransition === "function"
      ? document.startViewTransition.bind(document)
      : null;

  if (reducedMotion || !startViewTransition) {
    update();
    finishAppearanceTransactionOnNextPaint();
    return;
  }

  let committed = false;
  const commitOnce = () => {
    if (committed) return;
    committed = true;
    update();
  };

  try {
    const transition = startViewTransition(commitOnce);
    void transition.finished.finally(() => {
      endAppearanceTransaction();
    });
  } catch {
    commitOnce();
    finishAppearanceTransactionOnNextPaint();
  }
}

function applyAppearance(
  resolvedTheme: ResolvedTheme,
  preset: ThemePreset,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.dataset.colorMode = resolvedTheme;
  root.dataset.themePreset = preset;
  root.style.colorScheme = resolvedTheme;
}

// ── persisted + in-memory appearance external stores ────────────────────────

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      runtimeThemeOverride = null;
    }
    if (event.key === PRESET_STORAGE_KEY || event.key === null) {
      runtimePresetOverride = null;
    }
    callback();
  };
  const onLocalChange = () => callback();

  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onLocalChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onLocalChange);
  };
}

function getThemeSnapshot(): ThemeMode {
  if (runtimeThemeOverride !== null) return runtimeThemeOverride;
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
  if (runtimePresetOverride !== null) return runtimePresetOverride;
  try {
    return normalizePreset(localStorage.getItem(PRESET_STORAGE_KEY));
  } catch {
    return DEFAULT_PRESET;
  }
}

function getPresetServerSnapshot(): ThemePreset {
  return DEFAULT_PRESET;
}

function persistTheme(theme: ThemeMode): void {
  runtimeThemeOverride = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    runtimeThemeOverride = null;
  } catch {
    // Keep the in-memory override. Persistence is optional; coherent live state is not.
  }
}

function persistPreset(preset: ThemePreset): void {
  runtimePresetOverride = preset;
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, preset);
    runtimePresetOverride = null;
  } catch {
    // Keep the in-memory override. Persistence is optional; coherent live state is not.
  }
}

function notifyAppearanceChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
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
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const currentPreset = getPresetSnapshot();

    commitAppearanceTransition(() => {
      persistTheme(normalized);
      applyAppearance(resolveTheme(normalized, systemPrefersDark), currentPreset);
      // Always notify the external store, even when localStorage persistence failed.
      notifyAppearanceChanged();
    });
  }, []);

  const setPreset = useCallback((newPreset: ThemePreset) => {
    const normalized = normalizePreset(newPreset);
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const currentTheme = getThemeSnapshot();

    commitAppearanceTransition(() => {
      persistPreset(normalized);
      applyAppearance(resolveTheme(currentTheme, systemPrefersDark), normalized);
      // Always notify the external store, even when localStorage persistence failed.
      notifyAppearanceChanged();
    });
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
