import "server-only";

import type { PrismaClient } from "@prisma/client";

import { SahelFlowError } from "@/types/errors";

const PROTECTED_MODELS = new Set([
  "Customer",
  "Order",
  "Conversation",
  "Message",
]);

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);

const RETURNING_BULK_OPERATIONS = new Set([
  "createManyAndReturn",
  "updateManyAndReturn",
]);

const PROTECTED_RELATIONS = new Set([
  "customer",
  "order",
  "orders",
  "conversation",
  "conversations",
  "message",
  "messages",
]);

const NESTED_WRITES = new Set([
  "create",
  "createMany",
  "connectOrCreate",
  "upsert",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedProtectedWrite(
  value: unknown,
  path: readonly string[] = [],
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const finding = nestedProtectedWrite(value[index], [...path, String(index)]);
      if (finding) return finding;
    }
    return null;
  }

  const object = record(value);
  if (!object) return null;

  for (const [property, nested] of Object.entries(object)) {
    const relationMutation = record(nested);
    if (
      PROTECTED_RELATIONS.has(property) &&
      relationMutation &&
      Object.keys(relationMutation).some((operation) =>
        NESTED_WRITES.has(operation),
      )
    ) {
      return [...path, property].join(".");
    }

    const finding = nestedProtectedWrite(nested, [...path, property]);
    if (finding) return finding;
  }

  return null;
}

function mutationPayloads(args: unknown, operation: string): unknown[] {
  const input = record(args);
  if (!input) return [];
  if (operation === "upsert") {
    return [input.create, input.update];
  }
  return [input.data];
}

export function assertProtectedMutationBoundary(
  model: string,
  operation: string,
  args: unknown,
): void {
  if (
    PROTECTED_MODELS.has(model) &&
    RETURNING_BULK_OPERATIONS.has(operation)
  ) {
    throw new SahelFlowError(
      `${model}.${operation} is blocked because returning bulk mutations bypass record-bound protected-data encryption and projection`,
      "PROTECTED_DATA_RETURNING_BULK_WRITE_BLOCKED",
      409,
    );
  }

  if (!WRITE_OPERATIONS.has(operation)) return;
  for (const payload of mutationPayloads(args, operation)) {
    const relation = nestedProtectedWrite(payload);
    if (!relation) continue;

    throw new SahelFlowError(
      `Nested protected-data mutation through ${relation} is blocked; write that record through its canonical service first`,
      "PROTECTED_DATA_NESTED_WRITE_BLOCKED",
      409,
    );
  }
}

/**
 * Global mutation boundary for Prisma operations that never reach the protected
 * model delegate. It runs before the record-aware encryption extensions and
 * rejects Prisma returning-bulk APIs plus protected writes nested under any
 * unprotected parent model, including both upsert branches.
 */
export function withProtectedMutationBoundary<T extends PrismaClient>(client: T) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertProtectedMutationBoundary(model, operation, args);
          return query(args);
        },
      },
    },
  });
}
