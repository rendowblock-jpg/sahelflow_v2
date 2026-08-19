import type { Locale } from "@/lib/i18n";

export const DESKTOP_RUNTIME_RECOVERED_EVENT =
  "sahelflow:desktop-runtime-recovered";
export const DESKTOP_RESUME_GAP_MS = 45_000;

const VALID_LOCALES: readonly Locale[] = ["ar", "fr", "en"];

export function isDesktopResumeGap(
  previousTickMs: number,
  currentTickMs: number,
  thresholdMs = DESKTOP_RESUME_GAP_MS,
): boolean {
  return currentTickMs - previousTickMs >= thresholdMs;
}

export function readRequestedLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)sahelflow-locale=([^;]+)/u);
  const value = match?.[1];
  return value && VALID_LOCALES.includes(value as Locale)
    ? (value as Locale)
    : null;
}
