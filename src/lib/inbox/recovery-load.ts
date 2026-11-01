// What the recovery dock asks for and when it admits it could not look.

/** The states a seller can act on. Asked of the server, so an old stuck row is never pushed out by newer applied ones. */
export const RECOVERY_STATUSES = ["retrying", "quarantined", "dead_letter"] as const;
export const RECOVERY_PAGE_LIMIT = 50;
export const RECOVERY_REQUEST_PATH = `/api/whatsapp/inbound?status=${RECOVERY_STATUSES.join(",")}&limit=${RECOVERY_PAGE_LIMIT}`;

/** One missed check can be a blink; this many in a row is told to the seller. */
export const CHECK_FAILED_AFTER = 2;

/** Failures in a row after one more failed check (capped: the number only needs to reach the limit). */
export function afterFailedCheck(failures: number): number {
  return Math.min(Math.max(0, failures) + 1, CHECK_FAILED_AFTER);
}

export function checkFailed(failures: number): boolean {
  return failures >= CHECK_FAILED_AFTER;
}
