/**
 * B7-4 mixed stock model — partitioned per-product stock transitions.
 *
 * Product.stock is a MIXED counter: it rolls up active variant stock AND
 * tracks direct (variantless) item stock. The previous per-item transition
 * loop recomputed product.stock from the variant aggregate after EVERY
 * variant item, so a variantless delta applied earlier in the same
 * transition was clobbered — the final product.stock depended on the order
 * of the order's items (drift for any product whose order mixes variant and
 * variantless lines).
 *
 * All stock transitions now process the order's items partitioned per
 * product and write product.stock exactly once per product as:
 *
 *   product.stock = (fresh active-variant rollup) + (variantless remainder)
 *
 * where the variantless remainder is the pre-transition remainder
 * (product.stock − Σ active variant stock) adjusted by this transition's
 * variantless deltas. Pure-variant products keep the exact rollup
 * semantics; pure-variantless products keep the exact direct-decrement
 * semantics; mixed products stop losing variantless deltas.
 */
import "server-only";

import { ConflictError } from "@/types/errors";
import type { OrderChangeTransactionClient } from "./order-change-service";

export interface StockTransitionItem {
  productId: string | null;
  productVariantId: string | null;
  quantity: number;
}

async function aggregateActiveVariantStock(
  tx: OrderChangeTransactionClient,
  productId: string,
): Promise<number> {
  const available = await tx.productVariant.aggregate({
    where: { productId, isActive: true },
    _sum: { stock: true },
  });
  return available._sum.stock ?? 0;
}

/**
 * Deduct stock for a confirmation-style transition. Variant rows are
 * decremented per item with an availability guard; the product rollup is
 * written once per product from the partition math.
 *
 * `requireAvailability: false` preserves the refund-reversal deduction
 * semantics (plain decrement, no availability guard — reversal compensation
 * must mirror what the restore did even if stock moved since).
 */
export async function deductOrderItemStock(
  tx: OrderChangeTransactionClient,
  items: StockTransitionItem[],
  opts?: { requireAvailability?: boolean },
): Promise<string[]> {
  const requireAvailability = opts?.requireAvailability ?? true;
  const byProduct = groupByProduct(items);
  const affectedProducts: string[] = [];

  for (const [productId, productItems] of byProduct) {
    affectedProducts.push(productId);

    const stockBefore = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stock: true, isActive: true, deletedAt: true },
    });
    const variantSumBefore = await aggregateActiveVariantStock(tx, productId);
    const variantlessRemainder = stockBefore.stock - variantSumBefore;

    for (const item of productItems) {
      if (!item.productVariantId) continue;
      const updated = await tx.productVariant.updateMany({
        where: requireAvailability
          ? {
              id: item.productVariantId,
              productId,
              isActive: true,
              stock: { gte: item.quantity },
            }
          : { id: item.productVariantId, productId },
        data: { stock: { decrement: item.quantity } },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          requireAvailability
            ? `Insufficient available stock for variant '${item.productVariantId}'`
            : `Variant '${item.productVariantId}' is missing or belongs to another product`,
        );
      }
    }

    const variantlessDelta = productItems
      .filter((item) => !item.productVariantId)
      .reduce((sum, item) => sum + item.quantity, 0);

    // Preserve the original variantless guard semantics: a deduct against an
    // inactive or soft-deleted product row was refused by its atomic guard.
    if (
      requireAvailability &&
      variantlessDelta > 0 &&
      (!stockBefore.isActive || stockBefore.deletedAt !== null)
    ) {
      throw new ConflictError(
        `Insufficient available stock for product '${productId}'`,
      );
    }
    if (
      requireAvailability &&
      variantlessDelta > variantlessRemainder
    ) {
      throw new ConflictError(
        `Insufficient available stock for product '${productId}'`,
      );
    }

    // Fresh rollup after the variant decrements (also reflects any
    // concurrent committed writes — honest final value).
    const variantSumAfter = await aggregateActiveVariantStock(tx, productId);
    await tx.product.update({
      where: { id: productId },
      data: {
        stock: variantSumAfter + variantlessRemainder - variantlessDelta,
      },
    });
  }

  return affectedProducts;
}

/**
 * Restore stock for a cancellation/return-style transition. Variant rows
 * are incremented per item; the product rollup is written once per product
 * from the partition math. No availability guards — restoration only adds.
 */
export async function restoreOrderItemStock(
  tx: OrderChangeTransactionClient,
  items: StockTransitionItem[],
): Promise<string[]> {
  const byProduct = groupByProduct(items);
  const affectedProducts: string[] = [];

  for (const [productId, productItems] of byProduct) {
    affectedProducts.push(productId);

    const stockBefore = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stock: true },
    });
    const variantSumBefore = await aggregateActiveVariantStock(tx, productId);
    const variantlessRemainder = stockBefore.stock - variantSumBefore;

    for (const item of productItems) {
      if (!item.productVariantId) continue;
      const restored = await tx.productVariant.updateMany({
        where: {
          id: item.productVariantId,
          productId,
        },
        data: { stock: { increment: item.quantity } },
      });
      if (restored.count !== 1) {
        throw new ConflictError(
          `Variant '${item.productVariantId}' is missing or belongs to another product`,
        );
      }
    }

    const variantlessDelta = productItems
      .filter((item) => !item.productVariantId)
      .reduce((sum, item) => sum + item.quantity, 0);

    const variantSumAfter = await aggregateActiveVariantStock(tx, productId);
    await tx.product.update({
      where: { id: productId },
      data: {
        stock: variantSumAfter + variantlessRemainder + variantlessDelta,
      },
    });
  }

  return affectedProducts;
}

function groupByProduct(
  items: StockTransitionItem[],
): Map<string, StockTransitionItem[]> {
  const byProduct = new Map<string, StockTransitionItem[]>();
  for (const item of items) {
    if (!item.productId) continue;
    const bucket = byProduct.get(item.productId);
    if (bucket) {
      bucket.push(item);
    } else {
      byProduct.set(item.productId, [item]);
    }
  }
  return byProduct;
}
