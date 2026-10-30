/**
 * Automatic backup worker. Every ~30 minutes it asks the pure `decideBackup`
 * whether a backup is due; if so it calls `createBackup()` directly (not the
 * route, so a lapsed licence cannot stop a local backup), records the outcome
 * in the state file and prunes old AUTOMATIC backups on this computer only.
 * A tick never throws; `stop()` waits for a backup in progress.
 *
 * Automatic backups are not uploaded to the cloud: the cloud copy is made by
 * the manual route for an enrolled shop, so the local prune here never has a
 * cloud copy to leave behind or remove.
 */
import "server-only";

import type { PrismaClient } from "@prisma/client";

import { logger } from "@/lib/logger";
import { isPackagedDesktopRuntime } from "@/lib/runtime/background-start";

import { backupFailureCode } from "./failure-code";
import {
  decideBackup,
  planRetention,
  type BackupDecisionReason,
  type RetentionEntry,
} from "./scheduled-backup";
import { scheduledBackupsHeld } from "./scheduled-backup-busy";
import {
  failedAttemptsInLast24h,
  forgetMissingBackups,
  readScheduledBackupState,
  recordBackupFailure,
  recordBackupSuccess,
  writeScheduledBackupState,
  type ScheduledBackupState,
} from "./scheduled-backup-state";

const STARTUP_DELAY_MS = 5 * 60_000;
const STARTUP_JITTER_RATIO = 0.2;
const CHECK_INTERVAL_MS = 30 * 60_000;
const CHECK_JITTER_RATIO = 0.1;

export interface ListedBackup {
  backupId: string;
  createdAtUnixMs: number;
  pinned: boolean;
  status: string;
}

export interface ScheduledBackupLog {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface ScheduledBackupDeps {
  now: () => number;
  random: () => number;
  isBusy: () => boolean;
  shopHasData: () => Promise<boolean>;
  createBackup: () => Promise<{ backupId: string }>;
  listBackups: () => Promise<ListedBackup[]>;
  /** Deletes the local copy only. */
  deleteBackup: (backupId: string) => Promise<unknown>;
  readState: () => Promise<ScheduledBackupState>;
  writeState: (state: ScheduledBackupState) => Promise<void>;
  log: ScheduledBackupLog;
}

export type TickOutcome =
  | { kind: "skipped"; reason: BackupDecisionReason }
  | { kind: "created"; backupId: string; pruned: number }
  | { kind: "failed"; code: string };

async function saveState(deps: ScheduledBackupDeps, state: ScheduledBackupState): Promise<void> {
  try {
    await deps.writeState(state);
  } catch (error) {
    deps.log.warn("backup.scheduled.state_write_failed", { code: backupFailureCode(error) });
  }
}

/** Newest usable backup time that is not in the future (a future time is a clock problem, not a backup). */
function newestPastBackup(listed: ListedBackup[] | null, now: number): number | null {
  let newest: number | null = null;
  for (const entry of listed ?? []) {
    const time = entry.createdAtUnixMs;
    if (entry.status === "corrupt" || !Number.isFinite(time) || time > now) continue;
    if (newest === null || time > newest) newest = time;
  }
  return newest;
}

async function prune(
  deps: ScheduledBackupDeps,
  state: ScheduledBackupState,
  now: number,
): Promise<{ removed: number; state: ScheduledBackupState }> {
  let listed: ListedBackup[];
  try {
    listed = await deps.listBackups();
  } catch (error) {
    deps.log.warn("backup.scheduled.prune_failed", { code: backupFailureCode(error) });
    return { removed: 0, state };
  }
  const tracked = new Set(state.automaticIds);
  const candidates: RetentionEntry[] = listed
    .filter((entry) => tracked.has(entry.backupId) && !entry.pinned && entry.status !== "corrupt")
    .map((entry) => ({ backupId: entry.backupId, createdAtMs: entry.createdAtUnixMs, automatic: true }));

  const present = new Set(listed.map((entry) => entry.backupId));
  let removed = 0;
  for (const backupId of planRetention(candidates, now).remove) {
    try {
      await deps.deleteBackup(backupId);
      present.delete(backupId);
      removed += 1;
    } catch (error) {
      deps.log.warn("backup.scheduled.prune_failed", { backupId, code: backupFailureCode(error) });
    }
  }
  const next = forgetMissingBackups(state, present);
  if (next.automaticIds.length !== state.automaticIds.length) await saveState(deps, next);
  return { removed, state: next };
}

async function tick(deps: ScheduledBackupDeps): Promise<TickOutcome> {
  if (deps.isBusy()) return { kind: "skipped", reason: "busy" };

  const now = deps.now();
  let state = await deps.readState();
  // If the data check fails, back up anyway: a spare backup costs nothing.
  const shopHasData = await deps.shopHasData().catch(() => true);
  const listed = await deps.listBackups().catch(() => null);

  const past = [
    state.lastSuccessAtMs !== null && state.lastSuccessAtMs <= now ? state.lastSuccessAtMs : null,
    newestPastBackup(listed, now),
  ].filter((time): time is number => time !== null);
  const decision = decideBackup({
    now,
    lastSuccessAt: past.length > 0 ? Math.max(...past) : state.lastSuccessAtMs,
    lastAttemptAt: state.lastAttemptAtMs,
    attemptsInLast24h: failedAttemptsInLast24h(state, now),
    shopHasData,
    busy: false,
  });
  if (!decision.run) return { kind: "skipped", reason: decision.reason };

  let backupId: string;
  try {
    ({ backupId } = await deps.createBackup());
  } catch (error) {
    const code = backupFailureCode(error);
    const failedAt = deps.now();
    state = recordBackupFailure(state, failedAt, code);
    await saveState(deps, state);
    deps.log.warn("backup.scheduled.failed", {
      code,
      attempts: failedAttemptsInLast24h(state, failedAt),
    });
    return { kind: "failed", code };
  }

  const doneAt = deps.now();
  state = recordBackupSuccess(state, backupId, doneAt);
  await saveState(deps, state);
  const pruned = await prune(deps, state, doneAt);
  deps.log.info("backup.scheduled.created", { backupId, reason: decision.reason, pruned: pruned.removed });
  return { kind: "created", backupId, pruned: pruned.removed };
}

/** One check. Never throws. */
export async function runScheduledBackupTick(deps: ScheduledBackupDeps): Promise<TickOutcome> {
  try {
    return await tick(deps);
  } catch (error) {
    const code = backupFailureCode(error);
    try {
      deps.log.warn("backup.scheduled.tick_failed", { code });
    } catch {
      // A broken logger must not break the loop either.
    }
    return { kind: "failed", code };
  }
}

export interface ScheduledBackupWorkerOptions {
  startupDelayMs?: number;
  intervalMs?: number;
}

export interface ScheduledBackupWorker {
  start(): void;
  stop(): Promise<void>;
}

export function createScheduledBackupWorker(
  deps: ScheduledBackupDeps,
  options: ScheduledBackupWorkerOptions = {},
): ScheduledBackupWorker {
  const startupDelayMs = options.startupDelayMs ?? STARTUP_DELAY_MS;
  const intervalMs = options.intervalMs ?? CHECK_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const delay = (base: number, ratio: number): number => {
    const unit = Math.min(Math.max(deps.random(), 0), 0.999999);
    return base + Math.floor(unit * base * ratio);
  };

  const schedule = (ms: number): void => {
    if (stopped) return;
    timer = setTimeout(fire, ms);
    timer.unref?.();
  };

  function fire(): void {
    timer = null;
    if (stopped) return;
    inFlight = runScheduledBackupTick(deps)
      .then(() => undefined)
      .finally(() => {
        inFlight = null;
        schedule(delay(intervalMs, CHECK_JITTER_RATIO));
      });
  }

  return {
    start() {
      if (started || stopped) return;
      started = true;
      schedule(delay(startupDelayMs, STARTUP_JITTER_RATIO));
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await inFlight;
    },
  };
}

const WORKER_KEY = Symbol.for("sahelflow.scheduled-backup.worker");
type WorkerHost = typeof globalThis & { [WORKER_KEY]?: ScheduledBackupWorker };

async function shopHasAnyData(): Promise<boolean> {
  const { db } = await import("@/lib/db");
  const client = db as unknown as PrismaClient;
  const [order, product, customer] = await Promise.all([
    client.order.findFirst({ select: { id: true } }),
    client.product.findFirst({ select: { id: true } }),
    client.customer.findFirst({ select: { id: true } }),
  ]);
  return Boolean(order ?? product ?? customer);
}

function productionDeps(): ScheduledBackupDeps {
  return {
    now: () => Date.now(),
    random: () => Math.random(),
    isBusy: scheduledBackupsHeld,
    shopHasData: shopHasAnyData,
    createBackup: async () => (await import("@/lib/backup")).createBackup(),
    listBackups: async () => (await import("@/lib/backup")).listBackups(),
    deleteBackup: async (backupId) => (await import("@/lib/backup")).deleteBackup(backupId),
    readState: readScheduledBackupState,
    writeState: writeScheduledBackupState,
    log: logger,
  };
}

/**
 * Starts the loop once per process. Only the packaged desktop has the native
 * backup bridge, so development, tests and CI never start it.
 */
export function startScheduledBackupWorker(): void {
  const host = globalThis as WorkerHost;
  if (host[WORKER_KEY] || !isPackagedDesktopRuntime()) return;
  const worker = createScheduledBackupWorker(productionDeps());
  host[WORKER_KEY] = worker;
  worker.start();
}

export async function stopScheduledBackupWorker(): Promise<void> {
  const host = globalThis as WorkerHost;
  const worker = host[WORKER_KEY];
  delete host[WORKER_KEY];
  await worker?.stop();
}
