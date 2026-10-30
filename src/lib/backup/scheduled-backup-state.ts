/**
 * What the scheduler remembers between ticks and launches, in one small JSON
 * file in the app data directory. It exists because the native backup always
 * labels a backup "manual": this file is the only record of which backups the
 * scheduler made, so retention can delete those and never a seller's own.
 * A missing or damaged file reads as empty (the scheduler then simply makes a
 * backup; older automatic backups are left alone).
 */
import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dataRoot } from "@/lib/storage/data-root";

import { ATTEMPT_WINDOW_MS } from "./scheduled-backup";

const MAX_TRACKED_IDS = 200;
const MAX_FAILURES = 10;
const SAFE_CODE = /^[A-Za-z0-9_]{1,40}$/;

export interface ScheduledBackupState {
  version: 1;
  /** Ids of the backups the scheduler created, oldest first. */
  automaticIds: string[];
  lastSuccessAtMs: number | null;
  /** Time of the last FAILED attempt. */
  lastAttemptAtMs: number | null;
  /** Failed attempts since the last success (newest last). */
  failureTimesMs: number[];
  lastFailureCode: string | null;
}

export function emptyScheduledBackupState(): ScheduledBackupState {
  return {
    version: 1,
    automaticIds: [],
    lastSuccessAtMs: null,
    lastAttemptAtMs: null,
    failureTimesMs: [],
    lastFailureCode: null,
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseScheduledBackupState(raw: unknown): ScheduledBackupState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyScheduledBackupState();
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.automaticIds)) {
    return emptyScheduledBackupState();
  }
  const failures = Array.isArray(value.failureTimesMs) ? value.failureTimesMs : [];
  return {
    version: 1,
    automaticIds: value.automaticIds
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(-MAX_TRACKED_IDS),
    lastSuccessAtMs: finiteOrNull(value.lastSuccessAtMs),
    lastAttemptAtMs: finiteOrNull(value.lastAttemptAtMs),
    failureTimesMs: failures
      .filter((time): time is number => typeof time === "number" && Number.isFinite(time))
      .slice(-MAX_FAILURES),
    lastFailureCode:
      typeof value.lastFailureCode === "string" && SAFE_CODE.test(value.lastFailureCode)
        ? value.lastFailureCode
        : null,
  };
}

export function recordBackupSuccess(
  state: ScheduledBackupState,
  backupId: string,
  now: number,
): ScheduledBackupState {
  const ids = state.automaticIds.includes(backupId)
    ? state.automaticIds
    : [...state.automaticIds, backupId];
  return {
    ...state,
    automaticIds: ids.slice(-MAX_TRACKED_IDS),
    lastSuccessAtMs: now,
    lastAttemptAtMs: null,
    failureTimesMs: [],
    lastFailureCode: null,
  };
}

export function recordBackupFailure(
  state: ScheduledBackupState,
  now: number,
  code: string,
): ScheduledBackupState {
  return {
    ...state,
    lastAttemptAtMs: now,
    failureTimesMs: [
      ...state.failureTimesMs.filter((time) => now - time < ATTEMPT_WINDOW_MS),
      now,
    ].slice(-MAX_FAILURES),
    lastFailureCode: SAFE_CODE.test(code) ? code : "UNKNOWN",
  };
}

export function failedAttemptsInLast24h(state: ScheduledBackupState, now: number): number {
  return state.failureTimesMs.filter((time) => now - time < ATTEMPT_WINDOW_MS).length;
}

/** Drops ids the backup listing no longer has (deleted, or replaced by a restore). */
export function forgetMissingBackups(
  state: ScheduledBackupState,
  present: ReadonlySet<string>,
): ScheduledBackupState {
  return { ...state, automaticIds: state.automaticIds.filter((id) => present.has(id)) };
}

export function scheduledBackupStatePath(): string {
  return join(dataRoot(), "scheduled-backup", "state-v1.json");
}

export async function readScheduledBackupState(): Promise<ScheduledBackupState> {
  try {
    return parseScheduledBackupState(JSON.parse(await readFile(scheduledBackupStatePath(), "utf8")));
  } catch {
    return emptyScheduledBackupState();
  }
}

export async function writeScheduledBackupState(state: ScheduledBackupState): Promise<void> {
  const path = scheduledBackupStatePath();
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(join(path, ".."), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
