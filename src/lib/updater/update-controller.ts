import {
  PRE_UPDATE_BACKUP_TIMEOUT_MS,
  requestPreUpdateBackup,
  runPreUpdateBackup,
  type PreUpdateBackupOutcome,
} from "./pre-update-backup";
import { dispatchUpdate, getUpdateSnapshot, resetUpdateStoreForTests } from "./update-store";

/**
 * What the controller needs from the Tauri updater's `Update` resource. A
 * structural type, so this module has no Tauri import and can be driven by a
 * fake in tests. The real `Update` from `@tauri-apps/plugin-updater` satisfies it.
 */
export type UpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export interface UpdateHandle {
  readonly version: string;
  readonly date?: string | null;
  readonly body?: string | null;
  download(onEvent?: (event: UpdateDownloadEvent) => void): Promise<void>;
  install(): Promise<void>;
  close?(): Promise<void>;
}

let handle: UpdateHandle | null = null;
let busy = false;

/** How long a failed or timed-out backup stays on screen before the installer starts. */
const BACKUP_NOTICE_MS = 2_500;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function release(update: UpdateHandle): void {
  // The handle owns memory on the Rust side; free the ones we will not use.
  void update.close?.().catch(() => undefined);
}

/**
 * A check found an update. It only ever becomes visible in the top bar. It never
 * downloads anything by itself: a seller on mobile data decides when to spend
 * roughly a hundred megabytes.
 */
export function offerUpdate(update: UpdateHandle): void {
  const phase = getUpdateSnapshot().phase;
  if (phase === "downloading" || phase === "ready" || phase === "installing") {
    release(update);
    return;
  }
  if (handle && handle !== update) release(handle);
  handle = update;
  dispatchUpdate({
    type: "offer",
    version: update.version,
    date: update.date ?? null,
    notes: update.body?.trim() || null,
  });
}

/** A check found nothing: a previously offered update is no longer offered. */
export function withdrawUpdate(): void {
  dispatchUpdate({ type: "withdrawn" });
  if (getUpdateSnapshot().phase === "idle" && handle) {
    release(handle);
    handle = null;
  }
}

/** Download the offered update (the seller clicked Download). Idempotent. */
export async function downloadUpdate(): Promise<void> {
  const state = getUpdateSnapshot();
  const allowed =
    state.phase === "available" ||
    (state.phase === "error" && state.failedDuring === "download");
  if (busy || !handle || !allowed) return;

  busy = true;
  dispatchUpdate({ type: "download-started" });
  let total = 0;
  let received = 0;
  try {
    await handle.download((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        received += event.data.chunkLength;
        if (total > 0) {
          dispatchUpdate({ type: "progress", percent: (received / total) * 100 });
        }
      }
    });
    dispatchUpdate({ type: "download-finished" });
  } catch (error) {
    dispatchUpdate({ type: "failed", stage: "download", message: messageOf(error) });
  } finally {
    busy = false;
  }
}

/**
 * A fresh local backup before the installer runs. It can delay the update by at
 * most a minute and can never stop it: the seller may be updating to fix a bug,
 * and the update does not touch the shop's data. A failure is said plainly in
 * the chip and written to the log for support.
 */
async function backUpBeforeInstall(): Promise<void> {
  let outcome: PreUpdateBackupOutcome;
  try {
    outcome = await runPreUpdateBackup({
      request: requestPreUpdateBackup,
      timeoutMs: PRE_UPDATE_BACKUP_TIMEOUT_MS,
      onPhase: (phase, ended) => {
        dispatchUpdate({
          type: "backup-phase",
          phase,
          ageMinutes: ended?.kind === "skipped" ? ended.ageMinutes : undefined,
        });
      },
    });
  } catch {
    dispatchUpdate({ type: "backup-phase", phase: "running" });
    dispatchUpdate({ type: "backup-phase", phase: "failed" });
    outcome = { kind: "failed", code: "UNEXPECTED" };
  }
  if (outcome.kind !== "failed" && outcome.kind !== "timed-out") return;
  if (outcome.kind === "failed") {
    console.warn("[updater] pre-update backup failed", { code: outcome.code });
  } else {
    console.warn("[updater] pre-update backup timed-out");
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, BACKUP_NOTICE_MS);
  });
}

/**
 * Install the downloaded update (the seller clicked Restart). On Windows the
 * updater plugin runs the desktop shell's shutdown hook, starts the installer
 * and ends this process, so this promise normally never settles. A rejection
 * means the installer was not started and nothing changed.
 */
export async function installUpdate(): Promise<void> {
  const state = getUpdateSnapshot();
  const allowed =
    state.phase === "ready" ||
    (state.phase === "error" && state.failedDuring === "install");
  if (busy || !handle || !allowed) return;

  busy = true;
  dispatchUpdate({ type: "install-started" });
  const update = handle;
  try {
    await backUpBeforeInstall();
    await update.install();
  } catch (error) {
    dispatchUpdate({ type: "failed", stage: "install", message: messageOf(error) });
  } finally {
    busy = false;
  }
}

/** Retry whichever step failed. */
export async function retryUpdate(): Promise<void> {
  const state = getUpdateSnapshot();
  if (state.phase !== "error") return;
  if (state.failedDuring === "install") {
    await installUpdate();
  } else {
    await downloadUpdate();
  }
}

/** Test seam. */
export function resetUpdateControllerForTests(): void {
  handle = null;
  busy = false;
  resetUpdateStoreForTests();
}
