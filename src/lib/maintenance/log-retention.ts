/**
 * Bounded log retention (audit 7-d P3-12).
 *
 * AutomationLog, AuditLog and ExtractionMetric grow without bound in the
 * per-shop SQLite file. This sweeper caps each table at LOG_RETENTION_CAP
 * rows and enforces a 90-day age floor: a row is prunable when it is older
 * than the cap cutoff (the createdAt of the (cap+1)-th newest row, so exactly
 * the newest CAP rows survive) OR older than the 90-day window.
 *
 * Deletion is chunked into DELETE_CHUNK-row transactions (select ids →
 * deleteMany by id, in one tx per chunk) looped until the prunable set is
 * drained, so a large first sweep never starves SQLite's single writer or
 * holds one transaction open for minutes.
 *
 * A 24h last-run marker (Setting "maintenance.log_retention.last_run_v1")
 * throttles sweeps across worker ticks; the marker is written only after a
 * completed run so a failed sweep retries on the next tick.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { logger } from "@/lib/logger";

export const LOG_RETENTION_CAP = 10_000;
export const LOG_RETENTION_AGE_FLOOR_MS = 90 * 24 * 60 * 60 * 1000;
const DELETE_CHUNK = 500;
const LAST_RUN_KEY = "maintenance.log_retention.last_run_v1";
const LAST_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

const LOG_TARGETS = [
  "automationLog",
  "auditLog",
  "extractionMetric",
] as const;
type LogTarget = (typeof LOG_TARGETS)[number];

type TransactionClient = Prisma.TransactionClient;

interface RetentionDelegate {
  count(): Promise<number>;
  /** createdAt of the (skip+1)-th newest row, or null when the table is smaller. */
  newestCreatedAt(skip: number): Promise<Date | null>;
  oldestIdsOlderThan(cutoff: Date, take: number): Promise<string[]>;
  deleteByIds(ids: string[]): Promise<number>;
}

function retentionDelegate(
  client: TransactionClient,
  target: LogTarget,
): RetentionDelegate {
  const model = client[target] as unknown as {
    count(args?: { where?: unknown }): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<
      Array<{ id: string; createdAt: Date }>
    >;
    deleteMany(args: {
      where: { id: { in: string[] } };
    }): Promise<{ count: number }>;
  };
  return {
    count: () => model.count(),
    async newestCreatedAt(skip) {
      const rows = await model.findMany({
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: 1,
      });
      return rows[0]?.createdAt ?? null;
    },
    async oldestIdsOlderThan(cutoff, take) {
      const rows = await model.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take,
      });
      return rows.map((row) => row.id);
    },
    async deleteByIds(ids) {
      return (await model.deleteMany({ where: { id: { in: ids } } })).count;
    },
  };
}

async function sweepTable(
  prisma: PrismaClient,
  target: LogTarget,
  ageCutoff: Date,
): Promise<number> {
  const table = retentionDelegate(prisma, target);
  const total = await table.count();
  if (total === 0) return 0;

  // Prunable cutoff: the 90-day floor, raised to the cap cutoff when the
  // table exceeds its row budget (the newest CAP rows always survive).
  let cutoff = ageCutoff;
  if (total > LOG_RETENTION_CAP) {
    const capCutoff = await table.newestCreatedAt(LOG_RETENTION_CAP);
    if (capCutoff && capCutoff.getTime() > cutoff.getTime()) {
      cutoff = capCutoff;
    }
  }

  let drained = 0;
  for (;;) {
    const deletedCount = await prisma.$transaction(async (tx) => {
      const txTable = retentionDelegate(tx, target);
      const ids = await txTable.oldestIdsOlderThan(cutoff, DELETE_CHUNK);
      if (ids.length === 0) return 0;
      return txTable.deleteByIds(ids);
    });
    if (deletedCount === 0) break;
    drained += deletedCount;
  }
  return drained;
}

export interface LogRetentionResult {
  ran: boolean;
  skippedReason?: "recent-run";
  deleted: Record<string, number>;
}

export async function runLogRetention(
  prisma: PrismaClient,
  options: { force?: boolean } = {},
): Promise<LogRetentionResult> {
  const now = new Date();
  if (!options.force) {
    const marker = await prisma.setting.findUnique({
      where: { key: LAST_RUN_KEY },
      select: { value: true },
    });
    const lastRun = marker ? Date.parse(marker.value) : Number.NaN;
    if (
      Number.isFinite(lastRun) &&
      now.getTime() - lastRun < LAST_RUN_INTERVAL_MS
    ) {
      return { ran: false, skippedReason: "recent-run", deleted: {} };
    }
  }

  const ageCutoff = new Date(now.getTime() - LOG_RETENTION_AGE_FLOOR_MS);
  const deleted: Record<string, number> = {};
  for (const target of LOG_TARGETS) {
    deleted[target] = await sweepTable(prisma, target, ageCutoff);
  }

  await prisma.setting.upsert({
    where: { key: LAST_RUN_KEY },
    create: { key: LAST_RUN_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  });

  return { ran: true, deleted };
}

const WORKER_KEY = Symbol.for("sahelflow.log-retention.worker");

interface RetentionWorkerState {
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

type RetentionWorkerGlobal = typeof globalThis & {
  [WORKER_KEY]?: RetentionWorkerState;
};

const STARTUP_DELAY_MS = 90_000;
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Start the bounded log-retention worker. Never blocks startup (unref'd
 * timers, deferred first sweep); registers at most once per process via a
 * Symbol.for global guard so Next.js instrumentation hot reloads cannot
 * double-register.
 */
export function startLogRetentionWorker(): void {
  const workerGlobal = globalThis as RetentionWorkerGlobal;
  if (workerGlobal[WORKER_KEY]) return;

  const state: RetentionWorkerState = { running: false, timer: null };
  workerGlobal[WORKER_KEY] = state;

  const schedule = (delayMs: number) => {
    state.timer = setTimeout(() => void tick(), delayMs);
    state.timer.unref?.();
  };

  const tick = async () => {
    if (state.running) {
      schedule(TICK_INTERVAL_MS);
      return;
    }
    state.running = true;
    try {
      const { db } = await import("@/lib/db");
      const result = await runLogRetention(db);
      if (result.ran) {
        const summary = Object.entries(result.deleted)
          .map(([table, count]) => `${table}=${count}`)
          .join(" ");
        logger.info("maintenance.log_retention.sweep", {
          deleted: result.deleted,
          summary,
        });
      }
    } catch (error) {
      // Durable log rows remain authoritative; the next tick retries without
      // surfacing seller payload or PII into logs.
      logger.warn(
        "maintenance.log_retention.sweep_failed",
        error instanceof Error ? error : undefined,
      );
    } finally {
      state.running = false;
      schedule(TICK_INTERVAL_MS);
    }
  };

  schedule(STARTUP_DELAY_MS);
}
