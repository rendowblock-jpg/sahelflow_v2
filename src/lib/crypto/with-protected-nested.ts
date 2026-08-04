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

const ROW_RETURNING_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "create",
  "update",
  "upsert",
  "delete",
]);

type ExtensiblePrismaClient = Pick<PrismaClient, "$extends">;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Outer projection/decryption layer for every Prisma model. Model-specific
 * protected-field writes and top-level reads remain in `with-protected-pii`;
 * this layer ensures arbitrary relation graphs receive hidden identity/
 * ciphertext selections, recursive decryption, and exact projection cleanup.
 */
export function withProtectedNestedReads<
  TClient extends ExtensiblePrismaClient,
>(
  client: TClient,
  rawAuthority: PrismaClient,
  context: ShopContext,
) {
  const codec = createProtectedPiiCodec(rawAuthority, context);

  async function decryptRelationGraph(value: unknown): Promise<unknown> {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return Promise.all(value.map(decryptRelationGraph));
    }
    if (!isPlainRecord(value)) return value;

    const decrypted = (await codec.decryptNested(value)) as Record<
      string,
      unknown
    >;
    for (const [key, entry] of Object.entries(decrypted)) {
      if (Array.isArray(entry) || isPlainRecord(entry)) {
        decrypted[key] = await decryptRelationGraph(entry);
      }
    }
    return decrypted;
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!ROW_RETURNING_OPERATIONS.has(operation)) return query(args);
          const topModel = PROTECTED_MODELS.has(model) ? model : undefined;
          const plan = prepareProtectedSelection(
            args as {
              select?: Record<string, unknown>;
              include?: Record<string, unknown>;
            },
            topModel as never,
          );
          const result = await query(args);
          const decrypted = await decryptRelationGraph(result);
          return applyProtectedSelectionPlan(decrypted, plan) as never;
        },
      },
    },
  });
}
