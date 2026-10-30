/**
 * Why scheduled backups must wait. A staged restore replaces the data on the
 * next launch, so a backup taken in between would be of data about to vanish.
 * The hold lives on a process-global symbol so any server bundle can set it.
 */
export type ScheduledBackupHold = "restore-staged" | "update";

const HOLDS = Symbol.for("sahelflow.scheduled-backup.holds.v1");
type HoldHost = typeof globalThis & { [HOLDS]?: Set<ScheduledBackupHold> };

function holds(): Set<ScheduledBackupHold> {
  const host = globalThis as HoldHost;
  host[HOLDS] ??= new Set();
  return host[HOLDS];
}

export function holdScheduledBackups(reason: ScheduledBackupHold): void {
  holds().add(reason);
}

export function releaseScheduledBackups(reason: ScheduledBackupHold): void {
  holds().delete(reason);
}

export function scheduledBackupsHeld(): boolean {
  return holds().size > 0;
}
