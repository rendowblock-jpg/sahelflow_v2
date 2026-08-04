import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  applyProtectedSelectionPlan,
  createProtectedPiiCodec,
  prepareProtectedSelection,
  type ProtectedSelectionPlan,
} from "@/lib/crypto/protected-pii";
import type { ShopContext } from "@/lib/shops/context";

const PROTECTED_MODELS = new Set([
  "Customer",
  "Order",
  "Conversation",
  "Message",
]);

const RELATION_MODEL: Record<string, string | undefined> = {
  customer: "Customer",
  order: "Order",
  orders: "Order",
  conversation: "Conversation",
  conversations: "Conversation",
  message: "Message",
  messages: "Message",
};

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
type SelectionNode = {
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergePlans(
  left: ProtectedSelectionPlan | undefined,
  right: ProtectedSelectionPlan,
): ProtectedSelectionPlan {
  const merged: ProtectedSelectionPlan = {
    removeId: Boolean(left?.removeId || right.removeId),
    relations: { ...(left?.relations ?? {}) },
  };
  for (const [key, plan] of Object.entries(right.relations)) {
    merged.relations[key] = mergePlans(merged.relations[key], plan);
  }
  return merged;
}

/**
 * Recurse through unknown relation containers until a protected model is found.
 * This covers graphs such as Product→orderItems→order and
 * ReturnNote→return→order rather than only direct protected relations.
 */
function prepareRelationGraphSelection(
  node: SelectionNode,
  model?: string,
): ProtectedSelectionPlan {
  let plan = prepareProtectedSelection(node, model as never);
  for (const container of [node.select, node.include]) {
    if (!container) continue;
    for (const [key, value] of Object.entries(container)) {
      if (!isPlainRecord(value)) continue;
      const childPlan = prepareRelationGraphSelection(
        value as SelectionNode,
        RELATION_MODEL[key],
      );
      plan.relations[key] = mergePlans(plan.relations[key], childPlan);
    }
  }
  return plan;
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
          const plan = prepareRelationGraphSelection(
            args as SelectionNode,
            topModel,
          );
          const result = await query(args);
          const decrypted = await decryptRelationGraph(result);
          return applyProtectedSelectionPlan(decrypted, plan) as never;
        },
      },
    },
  });
}
