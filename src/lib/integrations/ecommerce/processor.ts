import "server-only";

import { randomUUID } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError, ValidationError } from "@/types/errors";
import { openCommerceSyncItem, sealCommerceSyncItem } from "./commerce-payload";
import { getEcommerceAdapter, loadEcommerceCredentials } from "./index";
import {
  COMMERCE_FETCH_MAX_ATTEMPTS,
  COMMERCE_LEASE_MS,
  commerceHash,
  commerceItemIdentity,
  commerceRetryAt,
  parseCommerceIntegrationConfig,
  safeCommerceErrorCode,
} from "./runtime-contracts";
import { upsertCanonicalCommerceOrder } from "./sync-engine";
import type { EcommercePlatform, NormalizedOrder } from "./types";

interface ClaimedRun {
  id: string;
  platform: EcommercePlatform;
  integrationId: string;
  sourceIdentity: string;
  initialWatermark: string;
  candidateWatermark: string;
  continuationCursor: string | null;
  pagesFetched: number;
  attemptCount: number;
  leaseToken: string;
}

interface ClaimedItem {
  id: string;
  runId: string;
  platform: EcommercePlatform;
  sourceOrderId: string;
  sourceRevision: string;
  payloadJson: string;
  payloadHash: string;
  attemptCount: number;
  maxAttempts: number;
  leaseToken: string;
  sourceIdentity: string;
}

function leaseCutoff(): Date {
  return new Date(Date.now() - COMMERCE_LEASE_MS);
}

async function claimCommerceRun(
  context: ServiceContext,
): Promise<ClaimedRun | null> {
  const now = new Date();
  const staleBefore = leaseCutoff();
  return context.prisma.$transaction(async (tx) => {
    const candidate = await tx.commerceSyncRun.findFirst({
      where: {
        fetchComplete: false,
        OR: [
          {
            status: { in: ["queued", "retrying"] },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: "fetching", lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return null;

    if (candidate.status === "fetching") {
      await tx.commerceSyncRunAttempt.updateMany({
        where: {
          runId: candidate.id,
          phase: "fetch",
          state: "processing",
          completedAt: null,
        },
        data: {
          state: "lease_expired",
          errorCode: "COMMERCE_FETCH_LEASE_EXPIRED",
          completedAt: now,
        },
      });
    }

    const leaseToken = randomUUID();
    const attemptNumber = candidate.attemptCount + 1;
    const claimed = await tx.commerceSyncRun.updateMany({
      where: { id: candidate.id, attemptCount: candidate.attemptCount },
      data: {
        status: "fetching",
        attemptCount: attemptNumber,
        leaseToken,
        lockedAt: now,
        startedAt: candidate.startedAt ?? now,
        nextAttemptAt: null,
        lastErrorCode: null,
        completedAt: null,
        deadLetteredAt: null,
      },
    });
    if (claimed.count !== 1) return null;
    await tx.commerceSyncRunAttempt.create({
      data: {
        id: randomUUID(),
        runId: candidate.id,
        attemptNumber,
        phase: "fetch",
        leaseToken,
        state: "processing",
      },
    });
    return {
      id: candidate.id,
      platform: candidate.platform as EcommercePlatform,
      integrationId: candidate.integrationId,
      sourceIdentity: candidate.sourceIdentity,
      initialWatermark: candidate.initialWatermark,
      candidateWatermark: candidate.candidateWatermark,
      continuationCursor: candidate.continuationCursor,
      pagesFetched: candidate.pagesFetched,
      attemptCount: attemptNumber,
      leaseToken,
    };
  });
}

async function failCommerceRunFetch(
  context: ServiceContext,
  run: ClaimedRun,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const errorCode = safeCommerceErrorCode(error);
  const dead = run.attemptCount >= COMMERCE_FETCH_MAX_ATTEMPTS;
  await context.prisma.$transaction([
    context.prisma.commerceSyncRunAttempt.updateMany({
      where: {
        runId: run.id,
        attemptNumber: run.attemptCount,
        phase: "fetch",
        leaseToken: run.leaseToken,
        state: "processing",
      },
      data: {
        state: dead ? "failed" : "retrying",
        errorCode,
        detailJson: JSON.stringify({ phase: "fetch" }),
        completedAt: now,
      },
    }),
    context.prisma.commerceSyncRun.updateMany({
      where: { id: run.id, leaseToken: run.leaseToken, status: "fetching" },
      data: {
        status: dead ? "dead_letter" : "retrying",
        leaseToken: null,
        lockedAt: null,
        lastErrorCode: errorCode,
        nextAttemptAt: dead ? null : commerceRetryAt(run.attemptCount),
        deadLetteredAt: dead ? now : null,
        completedAt: dead ? now : null,
      },
    }),
  ]);
}

async function persistFetchedPage(
  context: ServiceContext,
  run: ClaimedRun,
  page: {
    orders: NormalizedOrder[];
    nextCursor: string | null;
    candidateWatermark: string;
  },
): Promise<void> {
  const pageNumber = run.pagesFetched + 1;
  const pageId = commerceHash([run.id, "page", pageNumber]);
  const descriptors = await Promise.all(
    page.orders.map(async (order) => {
      if (order.source !== run.platform) {
        throw new SahelFlowError(
          `Adapter source '${order.source}' does not match '${run.platform}'`,
          "COMMERCE_SYNC_PLATFORM_MISMATCH",
          409,
        );
      }
      const { sourceRevision, payloadHash } = commerceItemIdentity(order);
      const itemId = commerceHash([
        run.id,
        run.platform,
        order.sourceOrderId,
        sourceRevision,
      ]);
      const payloadJson = await sealCommerceSyncItem(
        context,
        {
          runId: run.id,
          itemId,
          platform: run.platform,
          sourceOrderId: order.sourceOrderId,
          sourceRevision,
          payloadHash,
        },
        order,
      );
      return { order, itemId, sourceRevision, payloadHash, payloadJson };
    }),
  );
  const pageHash = commerceHash({
    cursorBefore: run.continuationCursor,
    cursorAfter: page.nextCursor,
    candidateWatermark: page.candidateWatermark,
    items: descriptors.map((entry) => [
      entry.order.sourceOrderId,
      entry.sourceRevision,
      entry.payloadHash,
    ]),
  });
  const now = new Date();

  await context.prisma.$transaction(async (tx) => {
    await tx.commerceSyncPage.create({
      data: {
        id: pageId,
        pageKey: `${run.id}:${pageNumber}`,
        runId: run.id,
        pageNumber,
        cursorBefore: run.continuationCursor,
        cursorAfter: page.nextCursor,
        candidateWatermark: page.candidateWatermark,
        itemCount: descriptors.length,
        pageHash,
      },
    });
    for (const descriptor of descriptors) {
      const existing = await tx.commerceSyncItem.findUnique({
        where: { itemKey: descriptor.itemId },
        select: { payloadHash: true },
      });
      if (existing && existing.payloadHash !== descriptor.payloadHash) {
        throw new SahelFlowError(
          "Provider item identity replayed with different normalized content",
          "COMMERCE_SYNC_ITEM_CONFLICT",
          409,
        );
      }
      if (!existing) {
        await tx.commerceSyncItem.create({
          data: {
            id: descriptor.itemId,
            itemKey: descriptor.itemId,
            runId: run.id,
            pageId,
            platform: run.platform,
            sourceOrderId: descriptor.order.sourceOrderId,
            sourceRevision: descriptor.sourceRevision,
            payloadJson: descriptor.payloadJson,
            payloadHash: descriptor.payloadHash,
            status: "queued",
            nextAttemptAt: now,
          },
        });
      }
    }
    await tx.commerceSyncRunAttempt.updateMany({
      where: {
        runId: run.id,
        attemptNumber: run.attemptCount,
        phase: "fetch",
        leaseToken: run.leaseToken,
        state: "processing",
      },
      data: { state: "succeeded", completedAt: now },
    });
    await tx.commerceSyncRun.updateMany({
      where: { id: run.id, leaseToken: run.leaseToken, status: "fetching" },
      data: {
        status: page.nextCursor ? "queued" : "processing",
        continuationCursor: page.nextCursor,
        candidateWatermark: page.candidateWatermark || run.candidateWatermark,
        pagesFetched: { increment: 1 },
        fetchedCount: { increment: descriptors.length },
        fetchComplete: page.nextCursor === null,
        hasMore: page.nextCursor !== null,
        leaseToken: null,
        lockedAt: null,
        nextAttemptAt: page.nextCursor ? now : null,
        lastErrorCode: null,
      },
    });
  });
}

export async function processNextCommerceFetch(
  context: ServiceContext,
): Promise<boolean> {
  const run = await claimCommerceRun(context);
  if (!run) return false;
  try {
    const credentials = await loadEcommerceCredentials(context, run.platform);
    if (!credentials) {
      throw new SahelFlowError(
        `No credentials configured for ${run.platform}`,
        "COMMERCE_SYNC_CREDENTIALS_MISSING",
        409,
      );
    }
    const adapter = getEcommerceAdapter(run.platform);
    const page = await adapter.fetchOrderPage(credentials, {
      watermark: run.initialWatermark,
      cursor: run.continuationCursor,
    });
    await persistFetchedPage(context, run, page);
  } catch (error) {
    await failCommerceRunFetch(context, run, error);
  }
  return true;
}

async function claimCommerceItem(
  context: ServiceContext,
): Promise<ClaimedItem | null> {
  const now = new Date();
  const staleBefore = leaseCutoff();
  return context.prisma.$transaction(async (tx) => {
    const candidate = await tx.commerceSyncItem.findFirst({
      where: {
        OR: [
          {
            status: { in: ["queued", "retrying"] },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: "processing", lockedAt: { lt: staleBefore } },
        ],
      },
      include: { run: { select: { sourceIdentity: true } } },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return null;

    if (candidate.status === "processing") {
      await tx.commerceSyncItemAttempt.updateMany({
        where: {
          itemId: candidate.id,
          state: "processing",
          completedAt: null,
        },
        data: {
          state: "lease_expired",
          errorCode: "COMMERCE_ITEM_LEASE_EXPIRED",
          completedAt: now,
        },
      });
    }

    const attemptNumber = candidate.attemptCount + 1;
    const leaseToken = randomUUID();
    const claimed = await tx.commerceSyncItem.updateMany({
      where: { id: candidate.id, attemptCount: candidate.attemptCount },
      data: {
        status: "processing",
        attemptCount: attemptNumber,
        leaseToken,
        lockedAt: now,
        startedAt: candidate.startedAt ?? now,
        nextAttemptAt: null,
        lastErrorCode: null,
        completedAt: null,
        deadLetteredAt: null,
      },
    });
    if (claimed.count !== 1) return null;
    await tx.commerceSyncItemAttempt.create({
      data: {
        id: randomUUID(),
        itemId: candidate.id,
        attemptNumber,
        leaseToken,
        state: "processing",
      },
    });
    return {
      id: candidate.id,
      runId: candidate.runId,
      platform: candidate.platform as EcommercePlatform,
      sourceOrderId: candidate.sourceOrderId,
      sourceRevision: candidate.sourceRevision,
      payloadJson: candidate.payloadJson,
      payloadHash: candidate.payloadHash,
      attemptCount: attemptNumber,
      maxAttempts: candidate.maxAttempts,
      leaseToken,
      sourceIdentity: candidate.run.sourceIdentity,
    };
  });
}

function quarantinesImmediately(error: unknown): boolean {
  return error instanceof SahelFlowError && error.statusCode < 500;
}

async function completeCommerceItem(
  context: ServiceContext,
  item: ClaimedItem,
  outcome: "created" | "updated" | "skipped",
): Promise<void> {
  const now = new Date();
  const order = await context.prisma.order.findFirst({
    where: {
      source: item.platform,
      sourceOrderId: item.sourceOrderId,
      deletedAt: null,
    },
    select: { id: true },
  });
  await context.prisma.$transaction([
    context.prisma.commerceSyncItemAttempt.updateMany({
      where: {
        itemId: item.id,
        attemptNumber: item.attemptCount,
        leaseToken: item.leaseToken,
        state: "processing",
      },
      data: {
        state: outcome === "skipped" ? "skipped" : "succeeded",
        completedAt: now,
      },
    }),
    context.prisma.commerceSyncItem.updateMany({
      where: { id: item.id, leaseToken: item.leaseToken, status: "processing" },
      data: {
        status: outcome === "skipped" ? "skipped" : "succeeded",
        outcome,
        canonicalOrderId: order?.id ?? null,
        leaseToken: null,
        lockedAt: null,
        completedAt: now,
        lastErrorCode: null,
      },
    }),
  ]);
}

async function failCommerceItem(
  context: ServiceContext,
  item: ClaimedItem,
  error: unknown,
): Promise<void> {
  const now = new Date();
  const errorCode = safeCommerceErrorCode(error);
  const quarantine = quarantinesImmediately(error);
  const dead = !quarantine && item.attemptCount >= item.maxAttempts;
  const status = quarantine ? "quarantined" : dead ? "dead_letter" : "retrying";
  await context.prisma.$transaction([
    context.prisma.commerceSyncItemAttempt.updateMany({
      where: {
        itemId: item.id,
        attemptNumber: item.attemptCount,
        leaseToken: item.leaseToken,
        state: "processing",
      },
      data: {
        state: status,
        errorCode,
        detailJson:
          error instanceof ValidationError && error.field
            ? JSON.stringify({ field: error.field })
            : null,
        completedAt: now,
      },
    }),
    context.prisma.commerceSyncItem.updateMany({
      where: { id: item.id, leaseToken: item.leaseToken, status: "processing" },
      data: {
        status,
        leaseToken: null,
        lockedAt: null,
        lastErrorCode: errorCode,
        nextAttemptAt:
          status === "retrying" ? commerceRetryAt(item.attemptCount) : null,
        deadLetteredAt: status === "dead_letter" ? now : null,
        completedAt: status === "retrying" ? null : now,
      },
    }),
  ]);
}

export async function processNextCommerceItem(
  context: ServiceContext,
): Promise<boolean> {
  const item = await claimCommerceItem(context);
  if (!item) return false;
  try {
    const order = await openCommerceSyncItem(
      context,
      {
        runId: item.runId,
        itemId: item.id,
        platform: item.platform,
        sourceOrderId: item.sourceOrderId,
        sourceRevision: item.sourceRevision,
        payloadHash: item.payloadHash,
      },
      item.payloadJson,
    );
    const outcome = await upsertCanonicalCommerceOrder(
      context,
      item.platform,
      item.sourceIdentity,
      order,
    );
    await completeCommerceItem(context, item, outcome);
  } catch (error) {
    await failCommerceItem(context, item, error);
  }
  return true;
}

export async function finalizeCommerceRuns(
  context: ServiceContext,
  limit = 10,
): Promise<number> {
  const runs = await context.prisma.commerceSyncRun.findMany({
    where: {
      fetchComplete: true,
      status: {
        in: [
          "processing",
          "queued",
          "retrying",
          "partially_completed",
          "dead_letter",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let finalized = 0;
  for (const run of runs) {
    const groups = await context.prisma.commerceSyncItem.groupBy({
      by: ["status"],
      where: { runId: run.id },
      _count: { _all: true },
    });
    const counts = new Map(
      groups.map((group) => [group.status, group._count._all]),
    );
    const active =
      (counts.get("queued") ?? 0) +
      (counts.get("processing") ?? 0) +
      (counts.get("retrying") ?? 0);
    if (active > 0) continue;

    const created = await context.prisma.commerceSyncItem.count({
      where: { runId: run.id, outcome: "created" },
    });
    const updated = await context.prisma.commerceSyncItem.count({
      where: { runId: run.id, outcome: "updated" },
    });
    const skipped = await context.prisma.commerceSyncItem.count({
      where: { runId: run.id, outcome: "skipped" },
    });
    const failed =
      (counts.get("quarantined") ?? 0) + (counts.get("dead_letter") ?? 0);
    if (failed > 0) {
      const terminal =
        created + updated + skipped > 0 ? "partially_completed" : "dead_letter";
      await context.prisma.commerceSyncRun.update({
        where: { id: run.id },
        data: {
          status: terminal,
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          failedCount: failed,
          lastErrorCode: "COMMERCE_ITEMS_REQUIRE_OPERATOR",
          completedAt: new Date(),
          deadLetteredAt: terminal === "dead_letter" ? new Date() : null,
        },
      });
      continue;
    }

    const now = new Date();
    await context.prisma.$transaction(async (tx) => {
      const integration = await tx.integration.findUnique({
        where: { id: run.integrationId },
        select: { config: true },
      });
      if (!integration) {
        throw new SahelFlowError(
          "Commerce integration disappeared before watermark commit",
          "COMMERCE_INTEGRATION_MISSING",
          409,
        );
      }
      const current = parseCommerceIntegrationConfig(integration.config);
      if (current.watermark !== run.initialWatermark) {
        await tx.commerceSyncRun.update({
          where: { id: run.id },
          data: {
            status: "dead_letter",
            lastErrorCode: "COMMERCE_WATERMARK_CONFLICT",
            deadLetteredAt: now,
            completedAt: now,
          },
        });
        return;
      }
      await tx.integration.update({
        where: { id: run.integrationId },
        data: {
          lastSyncAt: now,
          config: JSON.stringify({
            watermark: run.candidateWatermark,
            lastSyncAt: now.toISOString(),
          }),
        },
      });
      await tx.commerceSyncRun.update({
        where: { id: run.id },
        data: {
          status: "succeeded",
          activeKey: null,
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          failedCount: 0,
          lastErrorCode: null,
          completedAt: now,
          deadLetteredAt: null,
        },
      });
      finalized += 1;
    });
  }
  return finalized;
}

export async function drainCommerceRuntime(
  context: ServiceContext,
  limits: { fetches?: number; items?: number; finalizations?: number } = {},
): Promise<{ fetches: number; items: number; finalizations: number }> {
  let fetches = 0;
  let items = 0;
  const fetchLimit = limits.fetches ?? 2;
  const itemLimit = limits.items ?? 20;
  while (fetches < fetchLimit && (await processNextCommerceFetch(context))) {
    fetches += 1;
  }
  while (items < itemLimit && (await processNextCommerceItem(context))) {
    items += 1;
  }
  const finalizations = await finalizeCommerceRuns(
    context,
    limits.finalizations ?? 10,
  );
  return { fetches, items, finalizations };
}
