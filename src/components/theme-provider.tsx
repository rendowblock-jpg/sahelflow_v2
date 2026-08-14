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
  defaultPreset?: ThemePreset;
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
const THEME_COOKIE_KEY = "sahelflow-theme";
const PRESET_COOKIE_KEY = "sahelflow-theme-preset";
const APPEARANCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2;
const THEME_CHANGE_EVENT = "sahelflow:theme-change";
const DEFAULT_THEME: ThemeMode = "dark";
const DEFAULT_PRESET: ThemePreset = "sahel";
const PRESETS: ThemePreset[] = ["sahel", "atlas", "oasis", "dune"];

// Desktop production serves the packaged app from a localhost port selected at
// runtime. localStorage is port/origin scoped, so it cannot be the only durable
// appearance store across app restarts. Cookies are host scoped (not port scoped)
// and therefore bridge packaged-runtime port changes while localStorage remains a
// compatible browser/PWA mirror.
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

function parseTheme(value: string | null | undefined): ThemeMode | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

function normalizeTheme(value: string | null | undefined): ThemeMode {
  return parseTheme(value) ?? DEFAULT_THEME;
}

function parsePreset(value: string | null | undefined): ThemePreset | null {
  return value === "sahel" ||
    value === "atlas" ||
    value === "oasis" ||
    value === "dune"
    ? value
    : null;
}

function normalizePreset(value: string | null | undefined): ThemePreset {
  return parsePreset(value) ?? DEFAULT_PRESET;
}

function resolveTheme(theme: ThemeMode, systemDark: boolean): ResolvedTheme {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

function readCookie(key: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const prefix = `${encodeURIComponent(key)}=`;
    const entry = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
  } catch {
    return null;
  }
}

function persistCookie(key: string, value: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=${APPEARANCE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    return readCookie(key) === value;
  } catch {
    return false;
  }
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

  const cookieTheme = parseTheme(readCookie(THEME_COOKIE_KEY));
  if (cookieTheme) return cookieTheme;

  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function getPresetSnapshot(): ThemePreset {
  if (runtimePresetOverride !== null) return runtimePresetOverride;

  const cookiePreset = parsePreset(readCookie(PRESET_COOKIE_KEY));
  if (cookiePreset) return cookiePreset;

  try {
    return parsePreset(localStorage.getItem(PRESET_STORAGE_KEY)) ?? DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

function persistTheme(theme: ThemeMode): void {
  runtimeThemeOverride = theme;
  let persisted = persistCookie(THEME_COOKIE_KEY, theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    persisted = true;
  } catch {
    // Cookie persistence still carries desktop restarts when localStorage fails.
  }
  if (persisted) runtimeThemeOverride = null;
}

function persistPreset(preset: ThemePreset): void {
  runtimePresetOverride = preset;
  let persisted = persistCookie(PRESET_COOKIE_KEY, preset);
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, preset);
    persisted = true;
  } catch {
    // Cookie persistence still carries desktop restarts when localStorage fails.
  }
  if (persisted) runtimePresetOverride = null;
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
  defaultPreset = DEFAULT_PRESET,
  enableSystem = true,
}: ThemeProviderProps) {
  const storedTheme = useSyncExternalStore(
    subscribe,
    getThemeSnapshot,
    () => normalizeTheme(defaultTheme),
  );
  const preset = useSyncExternalStore(
    subscribe,
    getPresetSnapshot,
    () => normalizePreset(defaultPreset),
  );
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    getSystemSnapshot,
    getSystemServerSnapshot,
  );

  const theme = storedTheme || normalizeTheme(defaultTheme);
  const resolvedTheme = resolveTheme(theme, systemDark);

  // Reconcile initial hydration, migrate older localStorage-only preferences to
  // the host-scoped cookie, and respond to preset storage / OS scheme changes.
  useEffect(() => {
    persistTheme(theme);
    persistPreset(preset);
    applyAppearance(resolvedTheme, preset);
  }, [theme, resolvedTheme, preset]);

  const setTheme = useCallback((newTheme: string) => {
    const normalized = normalizeTheme(newTheme);
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const currentPreset = getPresetSnapshot();

    commitAppearanceTransition(() => {
      persistTheme(normalized);
      applyAppearance(resolveTheme(normalized, systemPrefersDark), currentPreset);
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
