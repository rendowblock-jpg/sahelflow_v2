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
