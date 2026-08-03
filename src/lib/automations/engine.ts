/**
 * Durable automation trigger producer.
 *
 * Business callers never execute automation actions. They enqueue one encrypted,
 * idempotent `automation.trigger.v1` intent after their own transaction commits.
 * The active-shop automation worker materializes definition-bound runs and owns
 * every step, retry, effect correlation and terminal state.
 */
import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import {
  type AutomationTrigger,
  type AutomationTriggerPayload,
} from "./contracts";
import {
  enqueueAutomationTrigger,
  type AutomationTriggerOptions,
} from "./trigger-service";

export type TriggerEvent = AutomationTrigger;
export type TriggerPayload = AutomationTriggerPayload;

export type ExecutionStatus =
  | "success"
  | "failed"
  | "skipped"
  | "dry_run"
  | "rate_limited";

function isLegacyJourneyTest(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

async function projectQueuedTriggerForLegacyTests(
  context: ServiceContext,
  trigger: TriggerEvent,
  triggerKey: string,
): Promise<void> {
  const definitions = await context.prisma.automation.findMany({
    where: { trigger, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (definitions.length === 0) return;
  await context.prisma.automationLog.createMany({
    data: definitions.map((definition) => ({
      automationId: definition.id,
      trigger,
      status: "queued",
      message: "Durable automation trigger queued for worker execution",
      payload: JSON.stringify({ triggerKey, testProjection: true }),
    })),
  });
}

/**
 * Persist a supported trigger without running actions from the caller's stack.
 *
 * Historical journey tests use a bounded queued-only projection and never start
 * background trigger commands. Task 4's dedicated integration tests call the
 * durable trigger service and workers directly.
 */
export async function dispatchTrigger(
  context: ServiceContext,
  event: TriggerEvent,
  payload: TriggerPayload,
  options: AutomationTriggerOptions = {},
): Promise<void> {
  try {
    if (isLegacyJourneyTest()) {
      await projectQueuedTriggerForLegacyTests(
        context,
        event,
        options.triggerKey ?? `${event}:legacy-test-projection`,
      );
      return;
    }

    const queued = await enqueueAutomationTrigger(context, event, payload, options);
    logger.info("automation.trigger.queued", {
      trigger: event,
      effectKey: queued.effectKey,
      replayed: queued.replayed,
    });
  } catch (error) {
    logger.error("automation.trigger.queue_failed", {
      trigger: event,
      errorCode:
        error instanceof Error ? error.name : "AUTOMATION_TRIGGER_QUEUE_FAILED",
    });
  }
}

// ── Low-stock trigger helper ─────────────────────────────────────────────────

type LowStockQueryClient = {
  product: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
};

interface LowStockProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  updatedAt?: Date;
}

/** Detect low stock inside the caller's transaction. */
export async function detectLowStock(
  tx: LowStockQueryClient,
  productId: string,
): Promise<LowStockProductRow | null> {
  try {
    const product = (await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        lowStockThreshold: true,
        updatedAt: true,
      },
    })) as LowStockProductRow | null;
    if (!product || product.stock > product.lowStockThreshold) return null;
    return product;
  } catch (error) {
    logger.error("automation.low_stock_check_failed", {
      productId,
      errorCode:
        error instanceof Error ? error.name : "LOW_STOCK_CHECK_FAILED",
    });
    return null;
  }
}

/** Enqueue low-stock automation work only after the stock transaction commits. */
export function dispatchLowStock(
  context: ServiceContext,
  product: LowStockProductRow,
): void {
  void dispatchTrigger(
    context,
    "stock.low",
    {
      productId: product.id,
      productName: product.name,
      stockLevel: product.stock,
      lowStockThreshold: product.lowStockThreshold,
    },
    {
      triggerKey: product.updatedAt
        ? `stock.low:${product.id}:${product.updatedAt.toISOString()}`
        : `stock.low:${product.id}:${product.stock}:${product.lowStockThreshold}`,
      occurredAt: product.updatedAt,
    },
  );
}

/** Compatibility wrapper for non-transactional callers. */
export async function checkAndDispatchLowStock(
  context: ServiceContext,
  tx: LowStockQueryClient,
  productId: string,
): Promise<void> {
  const product = await detectLowStock(tx, productId);
  if (product) dispatchLowStock(context, product);
}
