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

async function drainDurablePipelineForTests(context: ServiceContext): Promise<void> {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") return;
  const [{ drainDueAutomationTriggers }, { drainDueAutomationRuns }] =
    await Promise.all([
      import("./trigger-processor"),
      import("./run-processor"),
    ]);
  await drainDueAutomationTriggers(context, 25);
  // Database-local notification/tag/status steps complete in bounded ticks.
  // Provider effects remain waiting_effect and are not faked by this helper.
  for (let index = 0; index < 25; index += 1) {
    const results = await drainDueAutomationRuns(context, 25);
    if (results.length === 0) break;
    if (results.every((result) => result.state === "waiting_effect")) break;
  }
}

/**
 * Persist a supported trigger without running actions from the production
 * caller's stack. Tests drain the same durable state machines synchronously so
 * journey suites can observe their committed terminal projections.
 */
export async function dispatchTrigger(
  context: ServiceContext,
  event: TriggerEvent,
  payload: TriggerPayload,
  options: AutomationTriggerOptions = {},
): Promise<void> {
  try {
    const queued = await enqueueAutomationTrigger(context, event, payload, options);
    logger.info("automation.trigger.queued", {
      trigger: event,
      effectKey: queued.effectKey,
      replayed: queued.replayed,
    });
    await drainDurablePipelineForTests(context);
  } catch (error) {
    logger.error("automation.trigger.queue_failed", {
      trigger: event,
      errorCode: error instanceof Error ? error.name : "AUTOMATION_TRIGGER_QUEUE_FAILED",
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
      errorCode: error instanceof Error ? error.name : "LOW_STOCK_CHECK_FAILED",
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
