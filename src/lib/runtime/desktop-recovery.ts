import type { Locale } from "@/lib/i18n";

export const DESKTOP_RUNTIME_RECOVERED_EVENT =
  "sahelflow:desktop-runtime-recovered";
export const DESKTOP_RESUME_GAP_MS = 45_000;
export const DESKTOP_RECOVERY_RETRY_BASE_MS = 2_000;
export const DESKTOP_RECOVERY_RETRY_MAX_MS = 10_000;

const VALID_LOCALES: readonly Locale[] = ["ar", "fr", "en"];

export function isDesktopResumeGap(
  previousTickMs: number,
  currentTickMs: number,
  thresholdMs = DESKTOP_RESUME_GAP_MS,
): boolean {
  return currentTickMs - previousTickMs >= thresholdMs;
}

export function desktopRecoveryRetryDelayMs(failedRounds: number): number {
  const round = Math.max(1, Math.trunc(failedRounds));
  return Math.min(
    DESKTOP_RECOVERY_RETRY_BASE_MS * round,
    DESKTOP_RECOVERY_RETRY_MAX_MS,
  );
}

export async function waitForDesktopRuntimeRecovery({
  probe,
  wait,
  isCancelled = () => false,
}: {
  probe: () => Promise<boolean>;
  wait: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
}): Promise<boolean> {
  let failedRounds = 0;

  while (!isCancelled()) {
    const healthy = await probe();
    if (isCancelled()) return false;
    if (healthy) return true;

    failedRounds += 1;
    await wait(desktopRecoveryRetryDelayMs(failedRounds));
  }

  return false;
}

export function readRequestedLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)sahelflow-locale=([^;]+)/u);
  const value = match?.[1];
  return value && VALID_LOCALES.includes(value as Locale)
    ? (value as Locale)
    : null;
}
