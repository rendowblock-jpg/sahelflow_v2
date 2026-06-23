/**
 * Service layer base — shared helpers for all domain services.
 *
 * Each service takes a DbClient (the PII-encryption-extended Prisma client,
 * see src/lib/db.ts) and exposes typed methods that validate input (Zod),
 * enforce business rules, and throw typed errors (from @/types/errors).
 */
import "server-only";

import type { DbClient } from "@/lib/db";
import { SahelFlowError, NotFoundError, ValidationError } from "@/types/errors";

export type ServiceContext = {
  prisma: DbClient;
};

/**
 * Wrap a service call: catches Zod errors and converts to ValidationError,
 * lets SahelFlowError pass through, wraps unknown errors.
 */
export async function withServiceError<T>(
  fn: () => Promise<T>,
  resource: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SahelFlowError) throw err;
    if (err instanceof Error && err.name === "ZodError") {
      throw new ValidationError(err.message);
    }
    // Prisma not-found
    if (err instanceof Error && err.message.includes("Record to update not found")) {
      throw new NotFoundError(resource, "(unknown id)");
    }
    // Re-throw unknown with context
    console.error(`[${resource}] Unexpected error:`, err);
    throw new SahelFlowError(
      `Unexpected error in ${resource}: ${err instanceof Error ? err.message : String(err)}`,
      "INTERNAL_ERROR",
      500,
    );
  }
}

/** Generate the next order number: ORD-0001, ORD-0002, ... */
export function generateOrderNumber(sequence: number): string {
  return `ORD-${String(sequence).padStart(4, "0")}`;
}

/**
 * Atomically generate the next order number using a dedicated Counter row.
 *
 * Replaces the racy `db.order.count() + 1` pattern (D-005/T-011). The
 * `upsert` + `increment` translates to a single atomic SQL statement
 * (`INSERT ... ON CONFLICT UPDATE SET value = value + 1 RETURNING value`
 * in SQLite), so concurrent callers always get distinct values.
 *
 * @param prisma  The DbClient (PII-extended Prisma client)
 * @param prefix  Counter name / order-number prefix. "ORD" for manual/AI/storefront
 *                orders, "SYNC-SHOPIFY" / "SYNC-WOOCOMMERCE" / "SYNC-YOUCAN" for
 *                e-commerce sync orders. Each prefix has its own sequence.
 * @returns       The formatted order number (e.g. "ORD-0042", "SYNC-SHOPIFY-0007")
 */
export async function nextOrderNumber(
  prisma: DbClient,
  prefix = "ORD",
): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { name: prefix },
    update: { value: { increment: 1 } },
    create: { name: prefix, value: 1 },
  });
  return `${prefix}-${String(counter.value).padStart(4, "0")}`;
}
