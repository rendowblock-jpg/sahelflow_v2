import "server-only";

import type { PrismaClient } from "@prisma/client";

import {
  CONVERSATION_PROTECTED_FIELDS,
  CUSTOMER_PROTECTED_FIELDS,
  MESSAGE_PROTECTED_FIELDS,
  ORDER_PROTECTED_FIELDS,
  createProtectedPiiCodec,
  prepareProtectedSelection,
} from "@/lib/crypto/protected-pii";
import { executeRecordBoundUpsert } from "@/lib/crypto/protected-upsert";
import { assertProcessShopAuthority } from "@/lib/shops/authority";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

const NESTED_PROTECTED_RELATIONS = new Set([
  "customer",
  "order",
  "orders",
  "conversation",
  "conversations",
  "message",
  "messages",
]);

const NESTED_MUTATIONS = new Set([
  "create",
  "createMany",
  "connectOrCreate",
  "upsert",
  "update",
  "updateMany",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function assertNoNestedProtectedMutation(data: Record<string, unknown>): void {
  for (const [relation, value] of Object.entries(data)) {
    if (!NESTED_PROTECTED_RELATIONS.has(relation)) continue;
    const mutation = record(value);
    if (!mutation) continue;
    if ([...NESTED_MUTATIONS].some((operation) => operation in mutation)) {
      throw new SahelFlowError(
        `Nested protected-data mutation through ${relation} is blocked; write that record through its canonical service first`,
        "PROTECTED_DATA_NESTED_WRITE_BLOCKED",
        409,
      );
    }
  }
}

function assertWriteAuthority(context: ShopContext): void {
  if (process.env.NODE_ENV === "production") {
    assertProcessShopAuthority(context);
  }
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

/**
 * Consume protected-model upserts before the generic protection extension.
 *
 * Prisma's native upsert must prepare the update payload before SQLite reveals
 * which concurrent creator won. Contextual ciphertext cannot safely guess that
 * record ID, so this layer attempts the encrypted create first and resolves a
 * unique-race winner before encrypting the update branch. Other operations pass
 * through to the canonical protected-data extension unchanged.
 */
export function withProtectedRaceSafeUpserts<
  TClient extends Pick<PrismaClient, "$extends">,
>(
  client: TClient,
  rawAuthority: PrismaClient,
  context: ShopContext,
) {
  const codec = createProtectedPiiCodec(rawAuthority, context);

  const decryptCustomer = async (row: Record<string, unknown>) =>
    codec.decryptNested(await codec.decryptCustomerRow(row));
  const decryptOrder = async (row: Record<string, unknown>) =>
    codec.decryptNested(
      await codec.decryptFields(row, ORDER_PROTECTED_FIELDS, "Order"),
    );
  const decryptConversation = async (row: Record<string, unknown>) =>
    codec.decryptNested(
      await codec.decryptFields(
        row,
        CONVERSATION_PROTECTED_FIELDS,
        "Conversation",
      ),
    );
  const decryptMessage = async (row: Record<string, unknown>) =>
    codec.decryptNested(
      await codec.decryptFields(row, MESSAGE_PROTECTED_FIELDS, "Message"),
    );

  async function resolveCustomerWinnerId(
    transaction: PrismaClient,
    where: unknown,
  ): Promise<string | null> {
    const input = record(where);
    if (!input) return null;
    const phone = input.phone;
    if (typeof phone === "string" && !/^[0-9a-f]{64}$/.test(phone)) {
      const indexes = await codec.customerPhoneIndexes(phone);
      return (
        await transaction.customer.findFirst({
          where: customerFilterWithIndexes(input, indexes),
          select: { id: true },
        })
      )?.id ?? null;
    }
    return (
      await transaction.customer.findUnique({
        where: where as never,
        select: { id: true },
      })
    )?.id ?? null;
  }

  return client.$extends({
    query: {
      customer: {
        async upsert({ args }) {
          assertWriteAuthority(context);
          const where = args.where;
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          const encryptedCreate = await codec.encryptCustomerData(create, createId);
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Customer",
          );
          const row = await executeRecordBoundUpsert(rawAuthority, {
            delegate: "customer",
            args: args as unknown as Record<string, unknown>,
            encryptedCreate,
            update,
            encryptUpdate: (data, recordId) =>
              codec.encryptCustomerData(data, recordId),
            resolveWinnerId: (transaction) =>
              resolveCustomerWinnerId(transaction, where),
          });
          return (await decryptCustomer(row)) as never;
        },
      },
      order: {
        async upsert({ args }) {
          assertWriteAuthority(context);
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          const encryptedCreate = await codec.encryptFields(
            create,
            ORDER_PROTECTED_FIELDS,
            "Order",
            createId,
            { sourceField: "phone", indexField: "phoneBlindIndex" },
          );
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Order",
          );
          const row = await executeRecordBoundUpsert(rawAuthority, {
            delegate: "order",
            args: args as unknown as Record<string, unknown>,
            encryptedCreate,
            update,
            encryptUpdate: (data, recordId) =>
              codec.encryptFields(
                data,
                ORDER_PROTECTED_FIELDS,
                "Order",
                recordId,
                { sourceField: "phone", indexField: "phoneBlindIndex" },
              ),
          });
          return (await decryptOrder(row)) as never;
        },
      },
      conversation: {
        async upsert({ args }) {
          assertWriteAuthority(context);
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          const encryptedCreate = await codec.encryptFields(
            create,
            CONVERSATION_PROTECTED_FIELDS,
            "Conversation",
            createId,
          );
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          const row = await executeRecordBoundUpsert(rawAuthority, {
            delegate: "conversation",
            args: args as unknown as Record<string, unknown>,
            encryptedCreate,
            update,
            encryptUpdate: (data, recordId) =>
              codec.encryptFields(
                data,
                CONVERSATION_PROTECTED_FIELDS,
                "Conversation",
                recordId,
              ),
          });
          return (await decryptConversation(row)) as never;
        },
      },
      message: {
        async upsert({ args }) {
          assertWriteAuthority(context);
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          const encryptedCreate = await codec.encryptFields(
            create,
            MESSAGE_PROTECTED_FIELDS,
            "Message",
            createId,
          );
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Message",
          );
          const row = await executeRecordBoundUpsert(rawAuthority, {
            delegate: "message",
            args: args as unknown as Record<string, unknown>,
            encryptedCreate,
            update,
            encryptUpdate: (data, recordId) =>
              codec.encryptFields(
                data,
                MESSAGE_PROTECTED_FIELDS,
                "Message",
                recordId,
              ),
          });
          return (await decryptMessage(row)) as never;
        },
      },
    },
  });
}
