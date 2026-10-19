/**
 * One strict reading of a signed licence's expiry, shared by every Worker that
 * accepts a licence (the backup and the connected-platform Workers).
 *
 * Why this exists: both Workers used to write
 *   `claims.expiresAt && Date.parse(claims.expiresAt) <= Date.now()`.
 * For an expiry that is not a real date, Date.parse returns NaN, the comparison
 * is false and the licence passes as "not expired". The Worker then stored the
 * unreadable text, and its own database check (`datetime(entitlement_expires_at)`)
 * could never match it again: the workspace enrolled but could never
 * authenticate. An empty string was even treated as "never expires".
 *
 * The rule now: the expiry is either `null` (the licence does not expire) or a
 * complete ISO-8601 instant with an explicit zone, and a real calendar moment.
 * Anything else is refused at enrolment, loudly, instead of failing later.
 */

const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Milliseconds since the epoch, or `null` when the licence has no expiry.
 * Throws when the value is neither `null` nor a valid ISO-8601 instant.
 */
export function readEntitlementExpiry(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const match = typeof value === "string" ? INSTANT.exec(value) : null;
  if (!match) throw new Error("invalid entitlement expiry");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59 ||
    offsetHour > 23 || offsetMinute > 59
  ) throw new Error("invalid entitlement expiry");
  const ms = Date.parse(value as string);
  if (!Number.isFinite(ms)) throw new Error("invalid entitlement expiry");
  return ms;
}

/** True when the licence has an expiry and it is not in the future. */
export function entitlementHasExpired(value: unknown, now: number = Date.now()): boolean {
  const ms = readEntitlementExpiry(value);
  return ms !== null && ms <= now;
}
