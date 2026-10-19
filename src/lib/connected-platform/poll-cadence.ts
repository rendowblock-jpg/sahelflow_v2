/**
 * How often SahelFlow's background workers talk to the SahelFlow cloud.
 *
 * Why this exists: both connected workers used to call the cloud every five
 * seconds for as long as the app was open, whether or not there was anything to
 * fetch. One enrolled installation therefore made tens of thousands of requests
 * a day (the command worker alone made two per tick), all of them against a
 * shared Cloudflare account whose daily request allowance also serves licence
 * activation. A handful of installations would have exhausted it.
 *
 * The rule now is: be quick only while something is happening, and fall back to
 * a slow heartbeat when nothing is.
 *
 *  - Phone commands: the relay reports how many phones are paired and how many
 *    were seen in the last two minutes. No paired phone means a slow check. A
 *    paired phone that is not in use means a calm one-minute check. A phone that
 *    is in use, or a command that just arrived, means the quick five seconds.
 *  - Storefront receipts: quick right after activity, then relaxing, because a
 *    customer's order only has to reach the desktop within about a minute.
 *  - Failures back off exponentially instead of hammering a service that is
 *    already struggling.
 *
 * Pure functions only, so the budget is pinned by unit tests.
 */

export const POLL_ACTIVE_MS = 5_000;
export const POLL_WARM_MS = 15_000;
export const POLL_COOL_MS = 60_000;
export const POLL_NO_DEVICE_MS = 10 * 60_000;
export const POLL_FAILURE_CAP_MS = 5 * 60_000;

/** Silent polls at the quick pace before a receipt worker relaxes (about one minute). */
export const RECEIPT_ACTIVE_POLLS = 12;
/** Further silent polls at the warm pace before it settles (about four more minutes). */
export const RECEIPT_WARM_POLLS = 16;

export type RelayPresenceHint = Readonly<{
  pairedDevices?: unknown;
  activeDevices?: unknown;
}>;

function wholeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** Delay before the next phone-command poll. */
export function commandPollDelayMs(
  input: Readonly<{ hadWork: boolean; hint?: RelayPresenceHint | null }>,
): number {
  if (input.hadWork) return POLL_ACTIVE_MS;
  const paired = wholeCount(input.hint?.pairedDevices);
  const active = wholeCount(input.hint?.activeDevices);
  // A relay that does not report presence (older deployment, or a malformed
  // answer) must not make us fast: stay at a moderate pace.
  if (paired === null || active === null) return POLL_WARM_MS;
  if (paired === 0) return POLL_NO_DEVICE_MS;
  if (active > 0) return POLL_ACTIVE_MS;
  return POLL_COOL_MS;
}

/** Delay before the next storefront-receipt poll. */
export function receiptPollDelayMs(
  input: Readonly<{ hadWork: boolean; emptyStreak: number }>,
): number {
  if (input.hadWork) return POLL_ACTIVE_MS;
  const streak = Number.isSafeInteger(input.emptyStreak) && input.emptyStreak > 0
    ? input.emptyStreak
    : 0;
  if (streak < RECEIPT_ACTIVE_POLLS) return POLL_ACTIVE_MS;
  if (streak < RECEIPT_ACTIVE_POLLS + RECEIPT_WARM_POLLS) return POLL_WARM_MS;
  return POLL_COOL_MS;
}

/** Delay after `consecutiveFailures` failures in a row: 5 s, 10 s, 20 s ... capped at 5 min. */
export function failureDelayMs(
  consecutiveFailures: number,
  baseMs: number = POLL_ACTIVE_MS,
): number {
  const failures = Number.isSafeInteger(consecutiveFailures) && consecutiveFailures > 0
    ? consecutiveFailures
    : 0;
  if (failures <= 1) return baseMs;
  // 2 ** 20 already exceeds the cap for any base; the clamp avoids Infinity.
  return Math.min(POLL_FAILURE_CAP_MS, baseMs * 2 ** Math.min(failures - 1, 20));
}
