// Lifetime and rotation of the phone's device token (W4SEC-05). Pure: the decisions and the numbers live here, the SQL lives in worker.ts.
//
// The token is a random bearer secret the relay stores only as a SHA-256. Before this file it never aged. Now:
//   - a phone is asked to swap it once it is TOKEN_ROTATE_AFTER_MS old (the phone asks; see POST /v1/devices/rotate-token),
//   - the OLD token keeps working for TOKEN_ROTATE_GRACE_MS after a swap, so an answer lost on the way can not lock the phone out,
//   - nothing works past TOKEN_MAX_AGE_MS: the phone must be paired again.
// A phone paired before this change never swaps; the migration gives it a fresh TOKEN_MAX_AGE_MS from the day it runs.
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Age from which the relay hands out a new token when the phone asks. A seller opens the app most days, so a copied token dies about a week after the phone next calls home. */
export const TOKEN_ROTATE_AFTER_MS = 7 * DAY_MS;

/** Hard stop: a token this old is refused on every route and can not be swapped. Long enough for a seller away on holiday; it also cuts off an old app that can never swap. */
export const TOKEN_MAX_AGE_MS = 30 * DAY_MS;

/**
 * After a swap the previous token still works this long. The phone saves the new token only when the answer arrives; if it does not
 * (tunnel, app killed, second tab) the phone keeps calling with the old one and asks again. Any 401 makes the phone wipe itself, so
 * this is a day, not minutes: a phone that sleeps offline overnight must still be able to ask again. It is NOT extended by a second swap.
 */
export const TOKEN_ROTATE_GRACE_MS = 24 * HOUR_MS;

/** The signed swap request carries the phone's clock; the relay accepts this much difference either way. */
export const ROTATE_PROOF_MAX_SKEW_MS = 10 * MINUTE_MS;

/** A swap request is four short fields. */
export const MAX_ROTATE_BODY_BYTES = 4 * 1024;

/** The presented token is the one the relay holds now, or the one it replaced. */
export type TokenMatch = "current" | "previous";

/** Is the presented token still good? Nothing here tells the caller WHY it is not (a refusal looks the same to everyone). */
export function tokenIsLive(input: Readonly<{ match: TokenMatch; issuedAt: number; prevValidUntil: number | null; now: number }>): boolean {
  if (input.match === "previous") return input.prevValidUntil !== null && input.now < input.prevValidUntil;
  return input.now - input.issuedAt < TOKEN_MAX_AGE_MS;
}

/** Does a live token get a new one when it asks? The previous token always does: its holder evidently never received the current one. */
export function rotationDue(input: Readonly<{ match: TokenMatch; issuedAt: number; now: number }>): boolean {
  return input.match === "previous" || input.now - input.issuedAt >= TOKEN_ROTATE_AFTER_MS;
}

export function tokenExpiresAt(issuedAt: number): number {
  return issuedAt + TOKEN_MAX_AGE_MS;
}

export function proofIsFresh(claimedAt: number, now: number): boolean {
  return Number.isSafeInteger(claimedAt) && Math.abs(now - claimedAt) <= ROTATE_PROOF_MAX_SKEW_MS;
}
