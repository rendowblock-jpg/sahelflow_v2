import { translateServerError } from "@/lib/i18n/translate-server-error";

type Translate = Parameters<typeof translateServerError>[1];

/** The server answered and said no: the outcome is known. */
export class StudioRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(code ?? `request_failed_${status}`);
    this.name = "StudioRequestError";
    this.status = status;
    this.code = code;
  }
}

export type StudioFailure = Readonly<{
  reason: string;
  /** false = no answer at all: the change may or may not have happened. */
  outcomeKnown: boolean;
}>;

export function studioFailureReason(error: unknown, t: Translate): StudioFailure {
  if (error instanceof StudioRequestError) {
    return {
      reason: translateServerError(error.code, t, t("storefront.studioStates.failure.serverRefused")),
      outcomeKnown: true,
    };
  }
  return { reason: t("storefront.studioStates.failure.noConnection"), outcomeKnown: false };
}

export function publishFailureMessage(failure: StudioFailure, t: Translate): string {
  return failure.outcomeKnown
    ? t("storefront.studioStates.publish.failed", { reason: failure.reason })
    : t("storefront.studioStates.publish.failedUnknown");
}

/** The words of the always-visible draft status ("Saved", "Saving…", "Not saved: …"). */
export function saveStatusText(
  input: Readonly<{ state: string; dirty: boolean; time: string | undefined; reason: string | null }>,
  t: Translate,
): string {
  if (input.state === "saving") return t("storefront.studio.saving");
  if (input.state === "conflict") return t("storefront.studio.conflict");
  if (input.state === "error") {
    return input.reason
      ? t("storefront.studioStates.save.notSaved", { reason: input.reason })
      : t("storefront.studio.saveFailed");
  }
  if (input.dirty) return t("storefront.studio.unsaved");
  return input.time ? t("storefront.studio.savedAt", { time: input.time }) : t("storefront.studio.saved");
}

/** Which sheet Escape closes: the inspector, else the panel (phones only). */
export function topSheetToClose(
  input: Readonly<{ inspectorOpen: boolean; panelOpen: boolean; isPhone: boolean }>,
): "inspector" | "panel" | null {
  if (input.inspectorOpen) return "inspector";
  if (input.isPhone && input.panelOpen) return "panel";
  return null;
}
