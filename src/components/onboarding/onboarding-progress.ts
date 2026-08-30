/**
 * Onboarding checklist progress — persistence helpers (R4-b).
 *
 * There is no dedicated server-side onboarding flag (no Prisma model, no
 * profile column). The checklist therefore persists through the SAME mechanism
 * the wizard already used for shop basics: the generic settings API
 * (`PUT /api/settings` / `GET /api/settings`), under one non-secret
 * `onboarding_progress` key. The local-first SQLite Setting row survives
 * restarts, exactly like `business_wilaya`.
 *
 * Completion TRUTH is derived live from real configuration state (profile +
 * wilaya settings, WhatsApp connection status, delivery credentials, Gemini
 * key) — see onboarding-wizard.tsx. This record only stores what derived state
 * cannot know: where the seller stopped, and whether they finished the wizard
 * at least once.
 */

/** Settings key (non-secret, non-reserved) holding the serialized progress. */
export const ONBOARDING_PROGRESS_SETTING_KEY = "onboarding_progress";

/** Number of interactive setup steps (the finish screen is step index 4). */
export const ONBOARDING_STEP_COUNT = 4;

/** Index of the "You're ready" summary screen. */
export const ONBOARDING_FINISH_STEP = 4;

export interface OnboardingProgress {
  version: 1;
  /** 0..ONBOARDING_FINISH_STEP — where the seller stopped (resume point). */
  lastStep: number;
  /** ISO timestamp of the first "Launch dashboard" (wizard completion). */
  finishedAt: string | null;
}

export function clampOnboardingStep(step: number): number {
  // NaN is garbage -> fresh start; ±Infinity still clamps to the valid range.
  if (Number.isNaN(step)) return 0;
  const rounded = Math.trunc(step);
  if (rounded < 0) return 0;
  if (rounded > ONBOARDING_FINISH_STEP) return ONBOARDING_FINISH_STEP;
  return rounded;
}

/**
 * Parse the persisted progress JSON. Corrupt, foreign or future-shaped values
 * degrade to `null` (the caller then starts fresh) — a broken blob must never
 * block onboarding.
 */
export function parseOnboardingProgress(
  raw: string | null | undefined,
): OnboardingProgress | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Partial<OnboardingProgress>;
  if (candidate.version !== 1) return null;
  const finishedAt =
    typeof candidate.finishedAt === "string" && candidate.finishedAt !== ""
      ? candidate.finishedAt
      : null;
  const lastStep =
    typeof candidate.lastStep === "number"
      ? clampOnboardingStep(candidate.lastStep)
      : 0;
  return { version: 1, lastStep, finishedAt };
}

export function serializeOnboardingProgress(
  progress: OnboardingProgress,
): string {
  return JSON.stringify({
    version: 1,
    lastStep: clampOnboardingStep(progress.lastStep),
    finishedAt:
      typeof progress.finishedAt === "string" && progress.finishedAt !== ""
        ? progress.finishedAt
        : null,
  });
}

/** True when the seller already completed the wizard once (resume on summary). */
export function isOnboardingFinished(
  progress: OnboardingProgress | null,
): boolean {
  return progress?.finishedAt != null;
}
