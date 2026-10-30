import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { createBackup, listBackups } from "@/lib/backup";
import { backupFailureCode } from "@/lib/backup/failure-code";
import { decidePreUpdateBackup } from "@/lib/backup/scheduled-backup";
import {
  holdScheduledBackups,
  releaseScheduledBackups,
} from "@/lib/backup/scheduled-backup-busy";
import {
  readScheduledBackupState,
  recordPreUpdateBackup,
  writeScheduledBackupState,
} from "@/lib/backup/scheduled-backup-state";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { logger } from "@/lib/logger";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** The client gives up after this long; a slower backup is logged as over budget. */
const CLIENT_BUDGET_MS = 60_000;

type ActorContext = Awaited<ReturnType<typeof requireAuth>>;
type Reply = { status: number; body: Record<string, unknown> };

/** The shop owner, or the local desktop principal that stands in for the owner. */
function mayBackUpBeforeUpdate(actor: ActorContext["actor"]): boolean {
  return (
    actor.kind === "compatibility_local_owner" ||
    (actor.kind === "person" && actor.role === "owner")
  );
}

/** Newest backup of any kind that is usable. A future date is a clock problem, not a backup. */
function newestUsableBackup(
  listed: Awaited<ReturnType<typeof listBackups>> | null,
  now: number,
): number | null {
  let newest: number | null = null;
  for (const entry of listed ?? []) {
    const time = entry.createdAtUnixMs;
    if (entry.status === "corrupt" || !Number.isFinite(time) || time > now) continue;
    if (newest === null || time > newest) newest = time;
  }
  return newest;
}

async function backUpFirst(actorContext: ActorContext): Promise<Reply> {
  const startedAt = Date.now();
  // Hold the scheduled worker for the duration; the hold also expires by itself.
  holdScheduledBackups("update", startedAt);
  try {
    // If the list cannot be read there is no proof of a fresh backup: make one.
    const listed = await listBackups().catch((error: unknown) => {
      logger.warn("backup.pre_update.list_failed", { code: backupFailureCode(error) });
      return null;
    });
    const decision = decidePreUpdateBackup({
      now: startedAt,
      newestBackupAtMs: newestUsableBackup(listed, startedAt),
    });
    if (!decision.run) {
      return { status: 200, body: { skipped: "fresh", ageMinutes: decision.ageMinutes } };
    }

    let result: Awaited<ReturnType<typeof createBackup>>;
    try {
      result = await createBackup();
    } catch (error) {
      const code = backupFailureCode(error);
      logger.warn("backup.pre_update.failed", { code });
      return { status: 500, body: { ok: false, code } };
    }

    const doneAt = Date.now();
    const durationMs = Math.max(0, doneAt - startedAt);
    try {
      const state = await readScheduledBackupState();
      await writeScheduledBackupState(recordPreUpdateBackup(state, result.backupId, doneAt));
    } catch (error) {
      // The backup exists; only retention loses track of it.
      logger.warn("backup.pre_update.state_write_failed", { code: backupFailureCode(error) });
    }
    try {
      await logAudit(
        { prisma: db, shop: shopContext },
        {
          action: "backup.pre_update",
          entity: "backup",
          entityId: result.backupId,
          actor: trustedActorAuditIdentity(actorContext.actor),
          after: {
            backupId: result.backupId,
            shopCount: result.shopCount,
            containerBytes: result.containerBytes,
            durationMs,
          },
        },
      );
    } catch (error) {
      logger.warn("backup.pre_update.audit_failed", { code: backupFailureCode(error) });
    }
    logger.info("backup.pre_update.created", {
      backupId: result.backupId,
      durationMs,
      overBudget: durationMs > CLIENT_BUDGET_MS,
    });
    return { status: 201, body: { ok: true, backupId: result.backupId, durationMs } };
  } finally {
    releaseScheduledBackups("update");
  }
}

let inFlight: Promise<Reply> | null = null;

/**
 * A local backup right before an update installs. Never uploads to the cloud
 * and never asks for a licence: a seller whose licence lapsed can still update
 * safely. Answers `{ok, backupId, durationMs}`, `{skipped:"fresh", ageMinutes}`
 * when the newest backup is younger than 60 minutes, or `{ok:false, code}`.
 */
export const POST = withErrorHandler(async () => {
  const actorContext = await requireAuth("backups.create");
  if (!mayBackUpBeforeUpdate(actorContext.actor)) {
    throw new SahelFlowError("Only the shop owner can back up before an update", "FORBIDDEN", 403);
  }
  // Two requests at once (a double click, two windows) share one backup.
  inFlight ??= backUpFirst(actorContext).finally(() => {
    inFlight = null;
  });
  const reply = await inFlight;
  return NextResponse.json(reply.body, {
    status: reply.status,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/backup/pre-update");
