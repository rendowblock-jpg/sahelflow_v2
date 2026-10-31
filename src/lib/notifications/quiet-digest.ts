import { isInQuietHours, type QuietWindow } from "./quiet-hours";
import { shopHour } from "@/lib/time/shop-day";

/** Instant the quiet window last ended, or null when none/inside it now. */
export function quietWindowEndedAt(window: QuietWindow, now: Date): Date | null {
  const { quietStartMinute: start, quietEndMinute: end } = window;
  if (start === null || end === null || start === end) return null;
  if (isInQuietHours(window, now)) return null;
  const minute = shopHour(now) * 60 + now.getUTCMinutes();
  const since = (minute - end + 1440) % 1440;
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000 - since * 60_000);
}

export interface DigestPlan {
  /** the one row whose toast carries the summary, null when nothing to say */
  representativeId: string | null;
  /** other held rows: closed without a toast of their own */
  coveredIds: string[];
  /** how many held rows are still true */
  count: number;
  /** two or more: the toast says "N alerts came in while you were away" */
  summary: boolean;
}

/**
 * Rows held by quiet hours become ONE toast when the window is over, and only
 * for what is still true. heldIds is newest first. Inside the window nothing
 * is delivered, nothing is closed.
 */
export function planDigest(input: {
  window: QuietWindow;
  now: Date;
  heldIds: readonly string[];
  stillTrue: (id: string) => boolean;
}): DigestPlan {
  if (isInQuietHours(input.window, input.now)) {
    return { representativeId: null, coveredIds: [], count: 0, summary: false };
  }
  const live = input.heldIds.filter((id) => input.stillTrue(id));
  const representativeId = live[0] ?? null;
  return {
    representativeId,
    coveredIds: input.heldIds.filter((id) => id !== representativeId),
    count: live.length,
    summary: live.length >= 2,
  };
}
