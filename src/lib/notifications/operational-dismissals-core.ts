import { createHash } from "node:crypto";

/**
 * Which computed alerts a member has cleared, kept on the server.
 *
 * "9 orders need confirmation", "Low stock: X" and the other operational
 * alerts are derived from the shop's live state on every request; there is no
 * stored row to archive. A member who clears one is saying "I have seen it in
 * this state". That memory used to live in the WebView's `localStorage`, which
 * the packaged app loses on every launch: the desktop serves itself from a
 * loopback port chosen at random each time, `localStorage` belongs to one
 * origin (scheme, host AND port), and the next launch is a different origin
 * with an empty store. So every alert the seller cleared came back the next
 * time SahelFlow opened.
 *
 * The memory now lives in the shop database, per member, in the existing
 * `Setting` table, so it survives restarts, port changes and reinstalls that
 * keep the shop. Nothing in it identifies a customer: an alert id (for example
 * `order-<id>`) and a short hash of the text the member cleared.
 *
 * A dismissal is tied to the exact text it was shown with. When the situation
 * changes (stock falls further, more orders pile up) the text changes, the
 * hash no longer matches, and the alert returns: a real problem is never
 * hidden for good.
 */

/** Entries kept per member. The oldest are dropped first. */
export const DISMISSED_ALERT_LIMIT = 200;

const FORMAT_VERSION = 1;
const MAX_ID_LENGTH = 128;
const FINGERPRINT = /^[0-9a-f]{16}$/;

/** Alert id to the fingerprint of the text it was cleared with, oldest first. */
export type DismissedAlerts = ReadonlyMap<string, string>;

export interface AlertText {
  id: string;
  title: string;
  body: string;
}

/** A short, stable hash of what the member saw. Not reversible to the text. */
export function alertFingerprint(title: string, body: string): string {
  return createHash("sha256")
    .update(`${title}\u0000${body}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/**
 * Read the stored value. Anything unreadable becomes "nothing dismissed": a
 * damaged entry may show an alert again, it can never hide one or fail the feed.
 */
export function parseDismissedAlerts(raw: string | null | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return result;
  const record = parsed as { v?: unknown; e?: unknown };
  if (record.v !== FORMAT_VERSION || !Array.isArray(record.e)) return result;
  for (const entry of record.e) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [id, fingerprint] = entry as [unknown, unknown];
    if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH) continue;
    if (typeof fingerprint !== "string" || !FINGERPRINT.test(fingerprint)) continue;
    result.set(id, fingerprint);
  }
  return result;
}

export function serializeDismissedAlerts(dismissed: DismissedAlerts): string {
  return JSON.stringify({ v: FORMAT_VERSION, e: [...dismissed.entries()] });
}

/** True when this exact alert text was cleared and has not changed since. */
export function isAlertDismissed(alert: AlertText, dismissed: DismissedAlerts): boolean {
  return dismissed.get(alert.id) === alertFingerprint(alert.title, alert.body);
}

export function filterDismissedAlerts<T extends AlertText>(
  alerts: readonly T[],
  dismissed: DismissedAlerts,
): T[] {
  if (dismissed.size === 0) return [...alerts];
  return alerts.filter((alert) => !isAlertDismissed(alert, dismissed));
}

/** Add dismissals. A repeated id moves to the newest end, so it is dropped last. */
export function addDismissals(
  dismissed: DismissedAlerts,
  alerts: readonly AlertText[],
  limit = DISMISSED_ALERT_LIMIT,
): Map<string, string> {
  const next = new Map(dismissed);
  for (const alert of alerts) {
    next.delete(alert.id);
    next.set(alert.id, alertFingerprint(alert.title, alert.body));
  }
  while (next.size > limit) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

export function removeDismissals(
  dismissed: DismissedAlerts,
  ids: readonly string[],
): Map<string, string> {
  const next = new Map(dismissed);
  for (const id of ids) next.delete(id);
  return next;
}
