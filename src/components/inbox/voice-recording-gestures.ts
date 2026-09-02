/**
 * Ledger INB-24 — WhatsApp voice recording gestures, desktop pointer truth.
 *
 * The gesture decisions are pure so the contract suite can pin them exactly:
 *
 * - **Hold-to-record**: pressing the mic starts the take (same durable
 *   recorder path as before — gestures only orchestrate start/finish/cancel).
 * - **Slide-up-to-lock**: while holding, rising the pointer by
 *   `VOICE_LOCK_RISE_PX` locks the take — releasing the pointer then keeps
 *   recording instead of finishing (WhatsApp semantics; the lock protects an
 *   in-progress take from an accidental release).
 * - **Release-to-preview**: releasing without a lock finishes the take into
 *   the review surface instead of sending blindly.
 * - **Tap-to-record**: a quick tap (< `VOICE_TAP_MAX_MS`) keeps the take
 *   running, preserving the existing click-to-record muscle memory and the
 *   keyboard path (Enter starts a persistent take with visible pill
 *   controls — no gesture is ever required).
 * - **Slide-to-cancel**: dragging the recording pill horizontally by
 *   `VOICE_SLIDE_CANCEL_PX` (either physical direction — the pill carries no
 *   meaning on its own, so RTL and LTR get the same honest affordance)
 *   cancels the take.
 */

/** Pointer rise (px) that locks an in-progress hold-to-record take. */
export const VOICE_LOCK_RISE_PX = 48;

/** Horizontal pill drag (px) that cancels the recording. */
export const VOICE_SLIDE_CANCEL_PX = 96;

/**
 * Releases shorter than this are a tap, not a hold: the take keeps running
 * with the visible pill controls instead of finishing into the review.
 */
export const VOICE_TAP_MAX_MS = 500;

export type RecordingPointerUpDecision = "lock" | "finish" | "keep";

export function decideRecordingPointerUp(input: {
  locked: boolean;
  elapsedMs: number;
}): RecordingPointerUpDecision {
  if (input.locked) return "lock";
  if (input.elapsedMs < VOICE_TAP_MAX_MS) return "keep";
  return "finish";
}

/** True once the horizontal pill drag crosses the cancel threshold. */
export function decideSlideCancel(
  dx: number,
  threshold: number = VOICE_SLIDE_CANCEL_PX,
): boolean {
  return Math.abs(dx) >= threshold;
}

/**
 * Damped visual translation of the pill while dragging (px). The pill
 * follows the pointer at 60% and never travels beyond the threshold, so the
 * gesture always stays inside the composer chrome.
 */
export function slideTransform(
  dx: number,
  threshold: number = VOICE_SLIDE_CANCEL_PX,
): number {
  const clamped = Math.max(-threshold, Math.min(threshold, dx));
  return Math.round(clamped * 0.6);
}
