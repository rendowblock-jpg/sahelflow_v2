import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  applyProtectedSelectionPlan,
  createProtectedPiiCodec,
  prepareProtectedSelection,
} from "@/lib/crypto/protected-pii";
import type { ShopContext } from "@/lib/shops/context";

const PROTECTED_MODELS = new Set([
  "Customer",
  "Order",
  "Conversation",
  "Message",
]);

const READ_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
]);

/**
 * Outer projection/decryption layer for every Prisma model. Model-specific
 * protected-field writes and top-level reads remain in `with-protected-pii`;
 * this layer ensures any relation graph (Refund→Order, OrderItem→Order,
 * ReturnNote→Return→Order, Product→OrderItems→Order, etc.) receives hidden
 * identity/ciphertext selections, recursive decryption, and exact projection
 * cleanup rather than leaking ciphertext or injected IDs.
 */
export function withProtectedNestedReads<TClient extends PrismaClient>(
  client: TClient,
  rawAuthority: PrismaClient,
  context: ShopContext,
) {
  const codec = createProtectedPiiCodec(rawAuthority, context);
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!READ_OPERATIONS.has(operation)) return query(args);
          const topModel = PROTECTED_MODELS.has(model) ? model : undefined;
          const plan = prepareProtectedSelection(
            args as {
              select?: Record<string, unknown>;
              include?: Record<string, unknown>;
            },
            topModel as never,
          );
          const result = await query(args);
          const decrypted = await codec.decryptNested(result);
          return applyProtectedSelectionPlan(decrypted, plan) as never;
        },
      },
    },
  });
}
