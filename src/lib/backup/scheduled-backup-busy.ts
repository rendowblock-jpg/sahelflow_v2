/**
 * Why scheduled backups must wait. A staged restore replaces the data on the
 * next launch, so a backup taken in between would be of data about to vanish.
 * An update hold covers the backup made right before an update installs; it
 * expires by itself after 5 minutes, so a crashed client can never block
 * automatic backups for good. The holds live on a process-global symbol so any
 * server bundle can set them.
 */
export type ScheduledBackupHold = "restore-staged" | "update";

/** The longest an update hold can last, whatever happens to the one who set it. */
export const UPDATE_HOLD_MAX_MS = 5 * 60_000;

const HOLDS = Symbol.for("sahelflow.scheduled-backup.holds.v2");
/** reason -> time the hold ends (UTC ms), or null when it never expires. */
type HoldHost = typeof globalThis & { [HOLDS]?: Map<ScheduledBackupHold, number | null> };

function holds(): Map<ScheduledBackupHold, number | null> {
  const host = globalThis as HoldHost;
  host[HOLDS] ??= new Map();
  return host[HOLDS];
}

export function holdScheduledBackups(reason: ScheduledBackupHold, now: number = Date.now()): void {
  holds().set(reason, reason === "update" ? now + UPDATE_HOLD_MAX_MS : null);
}

export function releaseScheduledBackups(reason: ScheduledBackupHold): void {
  holds().delete(reason);
}

export function scheduledBackupsHeld(now: number = Date.now()): boolean {
  const map = holds();
  for (const [reason, endsAt] of map) {
    if (endsAt !== null && now >= endsAt) map.delete(reason);
  }
  return map.size > 0;
}
