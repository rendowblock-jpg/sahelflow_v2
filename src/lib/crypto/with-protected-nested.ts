import "server-only";

import type { PrismaClient } from "@prisma/client";

import { assertProtectedMutationBoundary } from "@/lib/crypto/with-protected-mutation-boundary";
import {
  applyProtectedSelectionPlan,
  CONVERSATION_PROTECTED_FIELDS,
  createProtectedPiiCodec,
  MESSAGE_PROTECTED_FIELDS,
  ORDER_PROTECTED_FIELDS,
  prepareProtectedSelection,
  type ProtectedSelectionPlan,
} from "@/lib/crypto/protected-pii";
import type { ShopContext } from "@/lib/shops/context";

type ProtectedModel = "Customer" | "Order" | "Conversation" | "Message";

const PROTECTED_MODELS = new Set<ProtectedModel>([
  "Customer",
  "Order",
  "Conversation",
  "Message",
]);

const RELATION_MODEL: Record<string, ProtectedModel | undefined> = {
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

const CUSTOMER_THROWING_READS = new Set([
  "findFirstOrThrow",
  "findUniqueOrThrow",
]);

type ExtensiblePrismaClient = Pick<PrismaClient, "$extends">;
type SelectionNode = {
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  where?: unknown;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function protectedModel(value: string): ProtectedModel | undefined {
  return PROTECTED_MODELS.has(value as ProtectedModel)
    ? (value as ProtectedModel)
    : undefined;
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

function prepareRelationGraphSelection(
  node: SelectionNode,
  model?: ProtectedModel,
): ProtectedSelectionPlan {
  const plan = prepareProtectedSelection(node, model);
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

function customerFilterWithIndexes(
  where: Record<string, unknown>,
  indexes: string[],
): Record<string, unknown> {
  return {
    ...where,
    phone: indexes.length === 1 ? indexes[0] : { in: indexes },
  };
}

export function withProtectedNestedReads<
  TClient extends ExtensiblePrismaClient,
>(
  client: TClient,
  rawAuthority: PrismaClient,
  context: ShopContext,
) {
  const codec = createProtectedPiiCodec(rawAuthority, context);

  async function rewriteCustomerThrowingWhere(
    operation: string,
    args: SelectionNode,
    model?: ProtectedModel,
  ): Promise<void> {
    if (model !== "Customer" || !CUSTOMER_THROWING_READS.has(operation)) {
      return;
    }
    const input = isPlainRecord(args.where) ? args.where : null;
    const phone = input?.phone;
    if (
      !input ||
      typeof phone !== "string" ||
      /^[0-9a-f]{64}$/.test(phone)
    ) {
      return;
    }

    const indexes = await codec.customerPhoneIndexes(phone);
    const filter = customerFilterWithIndexes(input, indexes);
    if (operation === "findFirstOrThrow") {
      args.where = filter;
      return;
    }

    const row = await rawAuthority.customer.findFirst({
      where: filter as never,
      select: { id: true },
    });
    args.where = row ? { id: row.id } : { phone: indexes[0] };
  }

  async function decryptModelRecord(
    row: Record<string, unknown>,
    model: ProtectedModel,
  ): Promise<Record<string, unknown>> {
    switch (model) {
      case "Customer":
        return codec.decryptCustomerRow(row);
      case "Order":
        return codec.decryptFields(row, ORDER_PROTECTED_FIELDS, "Order");
      case "Conversation":
        return codec.decryptFields(
          row,
          CONVERSATION_PROTECTED_FIELDS,
          "Conversation",
        );
      case "Message":
        return codec.decryptFields(row, MESSAGE_PROTECTED_FIELDS, "Message");
    }
  }

  async function decryptRelationGraph(
    value: unknown,
    model?: ProtectedModel,
  ): Promise<unknown> {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return Promise.all(value.map((entry) => decryptRelationGraph(entry, model)));
    }
    if (!isPlainRecord(value)) return value;

    const decrypted = model
      ? await decryptModelRecord(value, model)
      : { ...value };
    for (const [key, entry] of Object.entries(decrypted)) {
      if (Array.isArray(entry) || isPlainRecord(entry)) {
        decrypted[key] = await decryptRelationGraph(entry, RELATION_MODEL[key]);
      }
    }
    return decrypted;
  }

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertProtectedMutationBoundary(model, operation, args);
          if (!ROW_RETURNING_OPERATIONS.has(operation)) return query(args);
          const topModel = protectedModel(model);
          const queryArgs = args as SelectionNode;
          await rewriteCustomerThrowingWhere(operation, queryArgs, topModel);
          const plan = prepareRelationGraphSelection(queryArgs, topModel);
          const result = await query(args);
          const decrypted = await decryptRelationGraph(result, topModel);
          return applyProtectedSelectionPlan(decrypted, plan) as never;
        },
      },
    },
  });
}
