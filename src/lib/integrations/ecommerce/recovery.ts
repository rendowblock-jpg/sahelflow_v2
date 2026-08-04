import "server-only";

import { createHash } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";

const RECOVERABLE_ITEM_STATES = ["quarantined", "dead_letter"] as const;

export interface CommerceAttemptHistory {
  id: string;
  attemptNumber: number;
  state: string;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface CommerceItemHistory {
  id: string;
  sourceOrderId: string;
  sourceRevision: string;
  status: string;
  outcome: string | null;
  canonicalOrderId: string | null;
  attemptCount: number;
  operatorRetryCount: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attempts: CommerceAttemptHistory[];
}

export interface CommerceRunHistory {
  id: string;
  platform: string;
  status: string;
  pagesFetched: number;
  fetchComplete: boolean;
  hasMore: boolean;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  attemptCount: number;
  operatorRetryCount: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  recoverable: boolean;
  recoveryBlockCode: string | null;
  items: CommerceItemHistory[];
}

export interface RetryCommerceSyncInput {
  runId: string;
  reason: string;
  auditActor: string;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function recoveryDecision(run: {
  status: string;
  fetchComplete: boolean;
  lastErrorCode: string | null;
  items: Array<{ id: string; status: string }>;
}): {
  mode: "fetch" | "items" | null;
  itemIds: string[];
  blockCode: string | null;
} {
  if (run.status === "succeeded" || run.status === "cancelled") {
    return { mode: null, itemIds: [], blockCode: "COMMERCE_RUN_TERMINAL" };
  }
  if (run.lastErrorCode === "COMMERCE_WATERMARK_CONFLICT") {
    return {
      mode: null,
      itemIds: [],
      blockCode: "COMMERCE_WATERMARK_CONFLICT",
    };
  }
  if (!run.fetchComplete && run.status === "dead_letter") {
    return { mode: "fetch", itemIds: [], blockCode: null };
  }
  const itemIds = run.items
    .filter((item) =>
      (RECOVERABLE_ITEM_STATES as readonly string[]).includes(item.status),
    )
    .map((item) => item.id);
  if (itemIds.length > 0) {
    return { mode: "items", itemIds, blockCode: null };
  }
  return {
    mode: null,
    itemIds: [],
    blockCode: "COMMERCE_RETRY_TARGET_MISSING",
  };
}

export async function listCommerceSyncHistory(
  context: ServiceContext,
  limit = 20,
): Promise<CommerceRunHistory[]> {
  const bounded = Math.max(1, Math.min(limit, 50));
  const runs = await context.prisma.commerceSyncRun.findMany({
    orderBy: { createdAt: "desc" },
    take: bounded,
    select: {
      id: true,
      platform: true,
      status: true,
      pagesFetched: true,
      fetchComplete: true,
      hasMore: true,
      fetchedCount: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      failedCount: true,
      attemptCount: true,
      operatorRetryCount: true,
      lastErrorCode: true,
      nextAttemptAt: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true,
          sourceOrderId: true,
          sourceRevision: true,
          status: true,
          outcome: true,
          canonicalOrderId: true,
          attemptCount: true,
          operatorRetryCount: true,
          lastErrorCode: true,
          nextAttemptAt: true,
          startedAt: true,
          completedAt: true,
          attempts: {
            orderBy: { attemptNumber: "desc" },
            take: 8,
            select: {
              id: true,
              attemptNumber: true,
              state: true,
              errorCode: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });

  return runs.map((run) => {
    const decision = recoveryDecision(run);
    return {
      id: run.id,
      platform: run.platform,
      status: run.status,
      pagesFetched: run.pagesFetched,
      fetchComplete: run.fetchComplete,
      hasMore: run.hasMore,
      fetchedCount: run.fetchedCount,
      createdCount: run.createdCount,
      updatedCount: run.updatedCount,
      skippedCount: run.skippedCount,
      failedCount: run.failedCount,
      attemptCount: run.attemptCount,
      operatorRetryCount: run.operatorRetryCount,
      lastErrorCode: run.lastErrorCode,
      nextAttemptAt: iso(run.nextAttemptAt),
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      createdAt: run.createdAt.toISOString(),
      recoverable: decision.mode !== null,
      recoveryBlockCode: decision.blockCode,
      items: run.items.map((item) => ({
        id: item.id,
        sourceOrderId: item.sourceOrderId,
        sourceRevision: item.sourceRevision,
        status: item.status,
        outcome: item.outcome,
        canonicalOrderId: item.canonicalOrderId,
        attemptCount: item.attemptCount,
        operatorRetryCount: item.operatorRetryCount,
        lastErrorCode: item.lastErrorCode,
        nextAttemptAt: iso(item.nextAttemptAt),
        startedAt: iso(item.startedAt),
        completedAt: iso(item.completedAt),
        attempts: item.attempts.map((attempt) => ({
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          state: attempt.state,
          errorCode: attempt.errorCode,
          startedAt: attempt.startedAt.toISOString(),
          completedAt: iso(attempt.completedAt),
        })),
      })),
    };
  });
}

export async function retryCommerceSync(
  context: ServiceContext,
  input: RetryCommerceSyncInput,
): Promise<{
  runId: string;
  status: "queued" | "processing";
  mode: "fetch" | "items";
  retriedItemCount: number;
  operatorRetryCount: number;
}> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new SahelFlowError(
      "Commerce retry reason must contain 3 to 500 characters",
      "VALIDATION_ERROR",
      400,
    );
  }
  const reasonHash = createHash("sha256").update(reason).digest("hex");

  return context.prisma.$transaction(async (tx) => {
    const run = await tx.commerceSyncRun.findUnique({
      where: { id: input.runId },
      include: {
        items: {
          select: { id: true, status: true, operatorRetryCount: true },
        },
      },
    });
    if (!run) {
      throw new SahelFlowError("Commerce sync run not found", "NOT_FOUND", 404);
    }
    if (!run.activeKey) {
      throw new ConflictError(
        `Commerce run in state '${run.status}' cannot be retried`,
      );
    }

    const decision = recoveryDecision(run);
    if (!decision.mode) {
      throw new ConflictError(
        decision.blockCode === "COMMERCE_WATERMARK_CONFLICT"
          ? "The integration watermark changed outside this run; queue a new sync after reconciling the integration state"
          : decision.blockCode === "COMMERCE_RUN_TERMINAL"
            ? "A terminal commerce run cannot be retried"
            : "No recoverable commerce fetch or item was found",
      );
    }

    const now = new Date();
    const nextRetryCount = run.operatorRetryCount + 1;
    let status: "queued" | "processing";
    if (decision.mode === "fetch") {
      status = "queued";
      await tx.commerceSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          operatorRetryCount: nextRetryCount,
          nextAttemptAt: now,
          lockedAt: null,
          leaseToken: null,
          lastErrorCode: null,
          completedAt: null,
          deadLetteredAt: null,
        },
      });
    } else {
      status = "processing";
      await tx.commerceSyncItem.updateMany({
        where: { id: { in: decision.itemIds } },
        data: {
          status: "queued",
          operatorRetryCount: { increment: 1 },
          nextAttemptAt: now,
          lockedAt: null,
          leaseToken: null,
          lastErrorCode: null,
          completedAt: null,
          deadLetteredAt: null,
        },
      });
      await tx.commerceSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          operatorRetryCount: nextRetryCount,
          nextAttemptAt: null,
          lockedAt: null,
          leaseToken: null,
          lastErrorCode: null,
          completedAt: null,
          deadLetteredAt: null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "commerce.sync.retry_requested",
        entity: "commerce-sync-run",
        entityId: run.id,
        actor: input.auditActor,
        before: JSON.stringify({
          status: run.status,
          operatorRetryCount: run.operatorRetryCount,
          failedItemCount: decision.itemIds.length,
        }),
        after: JSON.stringify({
          status,
          operatorRetryCount: nextRetryCount,
          mode: decision.mode,
          retriedItemCount: decision.itemIds.length,
          requestedAt: now.toISOString(),
        }),
        metadata: JSON.stringify({
          reasonHash,
          reasonLength: reason.length,
        }),
      },
    });

    return {
      runId: run.id,
      status,
      mode: decision.mode,
      retriedItemCount: decision.itemIds.length,
      operatorRetryCount: nextRetryCount,
    };
  });
}
