/**
 * Scheduled backup: the pure decisions. No clock reads and no I/O, so every
 * edge (20 h, the retry waits, a clock that went backwards) is table-tested.
 * All times are UTC milliseconds; the time zone and DST never matter.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A backup older than this is replaced (a day, with room for a late start). */
export const BACKUP_MAX_AGE_MS = 20 * HOUR;
/** Wait after the 1st, 2nd and 3rd failed attempt before trying again. */
export const RETRY_WAIT_MS = [30 * MINUTE, 2 * HOUR, 4 * HOUR] as const;
export const MAX_ATTEMPTS_PER_DAY = 3;
export const ATTEMPT_WINDOW_MS = DAY;

export const RETENTION_DAILY = 7;
export const RETENTION_WEEKLY = 4;
export const RETENTION_PROTECT_NEWEST = 2;
export const RETENTION_MIN_AGE_MS = DAY;
/** The newest pre-update backups kept on top of the normal plan. */
export const RETENTION_KEEP_PRE_UPDATE = 2;
/** A backup younger than this is enough before an update installs. */
export const PRE_UPDATE_FRESH_MS = HOUR;

export type BackupDecisionReason =
  | "busy"
  | "no-data"
  | "fresh"
  | "due"
  | "clock-skew"
  | "backoff"
  | "attempt-limit";

export interface BackupDecisionInput {
  now: number;
  /** When the last backup succeeded, or null when unknown. */
  lastSuccessAt: number | null;
  /** When the last FAILED attempt happened (only read when there was a failure). */
  lastAttemptAt: number | null;
  /** Failed attempts since the last success, within the last 24 hours. */
  attemptsInLast24h: number;
  shopHasData: boolean;
  /** An update or a restore is in progress. */
  busy: boolean;
}

export interface BackupDecision {
  run: boolean;
  reason: BackupDecisionReason;
}

function isTime(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function decideBackup(input: BackupDecisionInput): BackupDecision {
  if (input.busy) return { run: false, reason: "busy" };
  if (!input.shopHasData) return { run: false, reason: "no-data" };

  const { now } = input;
  // A success dated after "now" means the clock moved: its age is unknown,
  // so run once. The fresh success the run records replaces that value.
  const clockSkew = isTime(input.lastSuccessAt) && input.lastSuccessAt > now;
  if (isTime(input.lastSuccessAt) && !clockSkew) {
    if (now - input.lastSuccessAt <= BACKUP_MAX_AGE_MS) {
      return { run: false, reason: "fresh" };
    }
  }

  const attempts = Number.isFinite(input.attemptsInLast24h)
    ? Math.max(0, Math.floor(input.attemptsInLast24h))
    : 0;
  if (attempts > 0) {
    // A failure stamped in the future is as unreliable as a future success:
    // ignore its wait, but the daily cap below still applies.
    if (isTime(input.lastAttemptAt) && input.lastAttemptAt <= now) {
      const wait = RETRY_WAIT_MS[Math.min(attempts, RETRY_WAIT_MS.length) - 1] ?? 0;
      if (now - input.lastAttemptAt < wait) return { run: false, reason: "backoff" };
    }
    if (attempts >= MAX_ATTEMPTS_PER_DAY) return { run: false, reason: "attempt-limit" };
  }
  return { run: true, reason: clockSkew ? "clock-skew" : "due" };
}

/** ISO 8601 week of a UTC instant, as "YYYY-Www" (the Thursday decides the year). */
export function isoWeekKey(ms: number): string {
  const date = new Date(ms);
  const mondayBased = (date.getUTCDay() + 6) % 7;
  const thursday = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - mondayBased + 3,
  );
  const year = new Date(thursday).getUTCFullYear();
  const dayOfYear = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY);
  return `${year}-W${String(Math.floor(dayOfYear / 7) + 1).padStart(2, "0")}`;
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface RetentionEntry {
  backupId: string;
  createdAtMs: number;
  /** True only for a backup this scheduler created. Everything else is never planned for deletion. */
  automatic: boolean;
}

export interface RetentionPlan {
  keep: string[];
  remove: string[];
}

/**
 * Which automatic backups to delete. Kept: the newest backup of each of the 7
 * newest days, the newest of each of the next 4 ISO weeks, the newest two
 * overall, and anything younger than 24 hours. On top of that the newest two
 * of `preUpdateIds` are kept, so the copy taken before the last updates is
 * still there if an update goes wrong. A manual backup is not part of the plan
 * at all. A date that cannot be read is kept.
 */
export function planRetention(
  entries: readonly RetentionEntry[],
  now: number,
  preUpdateIds: readonly string[] = [],
): RetentionPlan {
  const automatic = entries.filter((entry) => entry.automatic);
  const unreadable = automatic.filter((entry) => !Number.isFinite(entry.createdAtMs));
  const dated = automatic
    .filter((entry) => Number.isFinite(entry.createdAtMs))
    .sort(
      (left, right) =>
        right.createdAtMs - left.createdAtMs ||
        (left.backupId < right.backupId ? -1 : left.backupId > right.backupId ? 1 : 0),
    );

  const keep = new Set<string>(unreadable.map((entry) => entry.backupId));
  for (const entry of dated.slice(0, RETENTION_PROTECT_NEWEST)) keep.add(entry.backupId);
  for (const entry of dated) {
    if (now - entry.createdAtMs < RETENTION_MIN_AGE_MS) keep.add(entry.backupId);
  }

  const preUpdate = new Set(preUpdateIds);
  for (const entry of dated.filter((item) => preUpdate.has(item.backupId)).slice(0, RETENTION_KEEP_PRE_UPDATE)) {
    keep.add(entry.backupId);
  }

  const dailyDays = new Set<string>();
  for (const entry of dated) {
    const day = utcDayKey(entry.createdAtMs);
    if (dailyDays.has(day) || dailyDays.size >= RETENTION_DAILY) continue;
    dailyDays.add(day);
    keep.add(entry.backupId);
  }

  const weeks = new Set<string>();
  for (const entry of dated) {
    if (dailyDays.has(utcDayKey(entry.createdAtMs))) continue;
    const week = isoWeekKey(entry.createdAtMs);
    if (weeks.has(week) || weeks.size >= RETENTION_WEEKLY) continue;
    weeks.add(week);
    keep.add(entry.backupId);
  }

  const ordered = [...dated, ...unreadable];
  return {
    keep: ordered.filter((entry) => keep.has(entry.backupId)).map((entry) => entry.backupId),
    remove: ordered.filter((entry) => !keep.has(entry.backupId)).map((entry) => entry.backupId),
  };
}

export type PreUpdateDecision = { run: true } | { run: false; ageMinutes: number };

/**
 * Is a backup needed right before an update installs? Not when the newest one,
 * of any kind, is younger than 60 minutes. A time in the future is a clock
 * problem, not a backup, so it never counts.
 */
export function decidePreUpdateBackup(input: {
  now: number;
  newestBackupAtMs: number | null;
}): PreUpdateDecision {
  const newest = input.newestBackupAtMs;
  if (typeof newest !== "number" || !Number.isFinite(newest) || newest > input.now) {
    return { run: true };
  }
  const age = input.now - newest;
  if (age >= PRE_UPDATE_FRESH_MS) return { run: true };
  return { run: false, ageMinutes: Math.floor(age / MINUTE) };
}
