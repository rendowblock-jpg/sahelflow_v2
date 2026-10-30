/**
 * The seller-facing state of a software update, kept outside React so the
 * headless checker, the top-bar chip and the tests all see one truth.
 *
 *   idle -> available -> downloading -> ready -> installing
 *                 \________ error (retry) ________/
 *
 * Rules the reducer enforces, because each one is a way an updater annoys or
 * endangers a seller:
 *  - an update already being downloaded, ready or installing is never
 *    interrupted or regressed by a later check;
 *  - progress never goes backwards and never reads 100 until the download
 *    actually finished;
 *  - nothing moves to "installing" unless the update is ready.
 */

export type UpdatePhase =
  | "idle"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

import type { PreUpdateBackupPhase } from "./pre-update-backup";

export type UpdateFailureStage = "download" | "install";

export interface UpdateSnapshot {
  readonly phase: UpdatePhase;
  readonly version: string | null;
  readonly date: string | null;
  readonly notes: string | null;
  /** Whole percent, 0 to 100. Meaningful while downloading, ready or installing. */
  readonly percent: number;
  readonly failedDuring: UpdateFailureStage | null;
  readonly error: string | null;
  /** The backup made before the installer starts. Only set while installing. */
  readonly backup: PreUpdateBackupPhase | null;
  /** Age of the backup that made a new one unnecessary (backup === "skipped"). */
  readonly backupAgeMinutes: number | null;
}

export const IDLE_SNAPSHOT: UpdateSnapshot = Object.freeze({
  phase: "idle",
  version: null,
  date: null,
  notes: null,
  percent: 0,
  failedDuring: null,
  error: null,
  backup: null,
  backupAgeMinutes: null,
});

export type UpdateAction =
  | { type: "offer"; version: string; date: string | null; notes: string | null }
  | { type: "withdrawn" }
  | { type: "download-started" }
  | { type: "progress"; percent: number }
  | { type: "download-finished" }
  | { type: "install-started" }
  | { type: "backup-phase"; phase: PreUpdateBackupPhase; ageMinutes?: number }
  | { type: "failed"; stage: UpdateFailureStage; message: string };

const MAX_ERROR_CHARS = 300;

function clipMessage(message: string): string | null {
  const trimmed = message.trim().slice(0, MAX_ERROR_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

export function reduceUpdate(state: UpdateSnapshot, action: UpdateAction): UpdateSnapshot {
  switch (action.type) {
    case "offer": {
      if (
        state.phase === "downloading" ||
        state.phase === "ready" ||
        state.phase === "installing"
      ) {
        return state;
      }
      if (state.phase === "available" && state.version === action.version) {
        return state;
      }
      return {
        phase: "available",
        version: action.version,
        date: action.date,
        notes: action.notes,
        percent: 0,
        failedDuring: null,
        error: null,
        backup: null,
        backupAgeMinutes: null,
      };
    }
    case "withdrawn":
      return state.phase === "available" || state.phase === "error"
        ? IDLE_SNAPSHOT
        : state;
    case "download-started": {
      const canStart =
        state.phase === "available" ||
        (state.phase === "error" && state.failedDuring === "download");
      return canStart
        ? { ...state, phase: "downloading", percent: 0, failedDuring: null, error: null }
        : state;
    }
    case "progress": {
      if (state.phase !== "downloading" || !Number.isFinite(action.percent)) return state;
      const next = Math.max(state.percent, Math.min(99, Math.max(0, Math.floor(action.percent))));
      return next === state.percent ? state : { ...state, percent: next };
    }
    case "download-finished":
      return state.phase === "downloading"
        ? { ...state, phase: "ready", percent: 100 }
        : state;
    case "install-started": {
      const canInstall =
        state.phase === "ready" ||
        (state.phase === "error" && state.failedDuring === "install");
      return canInstall
        ? {
            ...state,
            phase: "installing",
            percent: 100,
            failedDuring: null,
            error: null,
            backup: null,
            backupAgeMinutes: null,
          }
        : state;
    }
    case "failed": {
      if (state.phase !== "downloading" && state.phase !== "installing") return state;
      return {
        ...state,
        phase: "error",
        failedDuring: action.stage,
        error: clipMessage(action.message),
        percent: action.stage === "install" ? 100 : 0,
        backup: null,
        backupAgeMinutes: null,
      };
    }
    case "backup-phase": {
      if (state.phase !== "installing") return state;
      if (action.phase === "running") {
        return state.backup === null ? { ...state, backup: "running", backupAgeMinutes: null } : state;
      }
      if (state.backup !== "running") return state;
      const age = action.ageMinutes;
      const minutes =
        action.phase === "skipped" ? (typeof age === "number" && Number.isFinite(age) ? Math.max(0, Math.floor(age)) : 0) : null;
      return { ...state, backup: action.phase, backupAgeMinutes: minutes };
    }
  }
}

let snapshot: UpdateSnapshot = IDLE_SNAPSHOT;
const listeners = new Set<() => void>();

export function getUpdateSnapshot(): UpdateSnapshot {
  return snapshot;
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dispatchUpdate(action: UpdateAction): void {
  const next = reduceUpdate(snapshot, action);
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

/** Test seam: put the store back to its initial state. */
export function resetUpdateStoreForTests(): void {
  snapshot = IDLE_SNAPSHOT;
  listeners.clear();
}
