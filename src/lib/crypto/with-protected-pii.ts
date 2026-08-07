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
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

interface RawDelegate {
  findUnique(args: {
    where: unknown;
    select: { id: true };
  }): Promise<{ id: string } | null>;
  findFirst(args: {
    where: unknown;
    select: { id: true };
  }): Promise<{ id: string } | null>;
}

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

function hasProtectedData(
  data: Record<string, unknown>,
  fields: readonly string[],
  customer = false,
): boolean {
  return (
    fields.some((field) => field in data) ||
    (customer && ("phone" in data || "phoneEnc" in data))
  );
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

function rejectProtectedBulkWrite(
  model: string,
  data: unknown,
  fields: readonly string[],
  customer = false,
): void {
  const value = record(data);
  if (!value || !hasProtectedData(value, fields, customer)) return;
  throw new SahelFlowError(
    `${model} protected fields cannot be updated in bulk because each value is authenticated to one record ID`,
    "PROTECTED_DATA_BULK_WRITE_BLOCKED",
    409,
  );
}

async function resolveId(
  delegate: RawDelegate,
  where: unknown,
  model: string,
): Promise<string> {
  const direct = record(where)?.id;
  if (typeof direct === "string" && direct) return direct;
  const row = await delegate.findUnique({ where, select: { id: true } });
  if (!row) {
    throw new SahelFlowError(
      `${model} record identity could not be resolved before protected-data mutation`,
      "PROTECTED_DATA_RECORD_ID_REQUIRED",
      409,
    );
  }
  return row.id;
}

function customerFilterWithIndexes(
  where: Record<string, unknown>,
  indexes: string[],
): Record<string, unknown> {
  const output = { ...where };
  output.phone = indexes.length === 1 ? indexes[0] : { in: indexes };
  return output;
}

/**
 * Prisma extension for the Phase 4 canonical protected-data authority.
 *
 * It writes contextual envelopes, reads both canonical and legacy generations,
 * searches both legacy/current phone indexes during the migration window, and
 * blocks bulk/nested writes that cannot preserve record-bound AAD.
 */
export function withProtectedPiiEncryption<T extends PrismaClient>(
  client: T,
  context: ShopContext,
) {
  const codec = createProtectedPiiCodec(client, context);
  const customerDelegate = client.customer as unknown as RawDelegate;
  const orderDelegate = client.order as unknown as RawDelegate;
  const conversationDelegate = client.conversation as unknown as RawDelegate;
  const messageDelegate = client.message as unknown as RawDelegate;

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

  async function customerUniqueWhere(where: unknown): Promise<unknown> {
    const input = record(where);
    const phone = input?.phone;
    if (!input || typeof phone !== "string" || /^[0-9a-f]{64}$/.test(phone)) {
      return where;
    }
    const indexes = await codec.customerPhoneIndexes(phone);
    const row = await customerDelegate.findFirst({
      where: customerFilterWithIndexes(input, indexes),
      select: { id: true },
    });
    return row ? { id: row.id } : { phone: indexes[0] };
  }

  async function customerManyWhere(where: unknown): Promise<unknown> {
    const input = record(where);
    const phone = input?.phone;
    if (!input || typeof phone !== "string" || /^[0-9a-f]{64}$/.test(phone)) {
      return where;
    }
    return customerFilterWithIndexes(input, await codec.customerPhoneIndexes(phone));
  }

  return client.$extends({
    query: {
      customer: {
        async create({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = codec.ensureRecordId(data);
          args.data = (await codec.encryptCustomerData(data, id)) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          return (await decryptCustomer(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          const encrypted = [];
          for (const entry of rows) {
            const data = entry as unknown as Record<string, unknown>;
            assertNoNestedProtectedMutation(data);
            const id = codec.ensureRecordId(data);
            encrypted.push(await codec.encryptCustomerData(data, id));
          }
          args.data = (Array.isArray(args.data) ? encrypted : encrypted[0]) as never;
          return query(args);
        },
        async update({ args, query }) {
          args.where = (await customerUniqueWhere(args.where)) as never;
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = await resolveId(customerDelegate, args.where, "Customer");
          args.data = (await codec.encryptCustomerData(data, id)) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          return (await decryptCustomer(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async updateMany({ args, query }) {
          rejectProtectedBulkWrite(
            "Customer",
            args.data,
            CUSTOMER_PROTECTED_FIELDS,
            true,
          );
          args.where = (await customerManyWhere(args.where)) as never;
          return query(args);
        },
        async upsert({ args, query }) {
          args.where = (await customerUniqueWhere(args.where)) as never;
          const existing = await customerDelegate.findUnique({
            where: args.where,
            select: { id: true },
          });
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          args.create = (await codec.encryptCustomerData(create, createId)) as never;
          args.update = (await codec.encryptCustomerData(
            update,
            existing?.id ?? createId,
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          return (await decryptCustomer(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async findMany({ args, query }) {
          args.where = (await customerManyWhere(args.where)) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          const rows = await query(args);
          return (await Promise.all(
            rows.map((row) =>
              decryptCustomer(row as unknown as Record<string, unknown>),
            ),
          )) as never;
        },
        async findUnique({ args, query }) {
          args.where = (await customerUniqueWhere(args.where)) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          const row = await query(args);
          return row
            ? ((await decryptCustomer(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async findFirst({ args, query }) {
          args.where = (await customerManyWhere(args.where)) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          const row = await query(args);
          return row
            ? ((await decryptCustomer(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async count({ args, query }) {
          args.where = (await customerManyWhere(args.where)) as never;
          return query(args);
        },
        async aggregate({ args, query }) {
          args.where = (await customerManyWhere(args.where)) as never;
          return query(args);
        },
        async delete({ args, query }) {
          args.where = (await customerUniqueWhere(args.where)) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Customer");
          return (await decryptCustomer(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async deleteMany({ args, query }) {
          args.where = (await customerManyWhere(args.where)) as never;
          return query(args);
        },
      },

      order: {
        async create({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = codec.ensureRecordId(data);
          args.data = (await codec.encryptFields(
            data,
            ORDER_PROTECTED_FIELDS,
            "Order",
            id,
            { sourceField: "phone", indexField: "phoneBlindIndex" },
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          return (await decryptOrder(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          const encrypted = [];
          for (const entry of rows) {
            const data = entry as unknown as Record<string, unknown>;
            assertNoNestedProtectedMutation(data);
            const id = codec.ensureRecordId(data);
            encrypted.push(
              await codec.encryptFields(
                data,
                ORDER_PROTECTED_FIELDS,
                "Order",
                id,
                { sourceField: "phone", indexField: "phoneBlindIndex" },
              ),
            );
          }
          args.data = (Array.isArray(args.data) ? encrypted : encrypted[0]) as never;
          return query(args);
        },
        async update({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = await resolveId(orderDelegate, args.where, "Order");
          args.data = (await codec.encryptFields(
            data,
            ORDER_PROTECTED_FIELDS,
            "Order",
            id,
            { sourceField: "phone", indexField: "phoneBlindIndex" },
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          return (await decryptOrder(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async updateMany({ args, query }) {
          rejectProtectedBulkWrite("Order", args.data, ORDER_PROTECTED_FIELDS);
          return query(args);
        },
        async upsert({ args, query }) {
          const existing = await orderDelegate.findUnique({
            where: args.where,
            select: { id: true },
          });
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          args.create = (await codec.encryptFields(
            create,
            ORDER_PROTECTED_FIELDS,
            "Order",
            createId,
            { sourceField: "phone", indexField: "phoneBlindIndex" },
          )) as never;
          args.update = (await codec.encryptFields(
            update,
            ORDER_PROTECTED_FIELDS,
            "Order",
            existing?.id ?? createId,
            { sourceField: "phone", indexField: "phoneBlindIndex" },
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          return (await decryptOrder(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async findMany({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          const rows = await query(args);
          return (await Promise.all(
            rows.map((row) =>
              decryptOrder(row as unknown as Record<string, unknown>),
            ),
          )) as never;
        },
        async findUnique({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          const row = await query(args);
          return row
            ? ((await decryptOrder(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async findFirst({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          const row = await query(args);
          return row
            ? ((await decryptOrder(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async delete({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Order");
          return (await decryptOrder(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
      },

      conversation: {
        async create({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = codec.ensureRecordId(data);
          args.data = (await codec.encryptFields(
            data,
            CONVERSATION_PROTECTED_FIELDS,
            "Conversation",
            id,
          )) as never;
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          return (await decryptConversation(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          const encrypted = [];
          for (const entry of rows) {
            const data = entry as unknown as Record<string, unknown>;
            assertNoNestedProtectedMutation(data);
            const id = codec.ensureRecordId(data);
            encrypted.push(
              await codec.encryptFields(
                data,
                CONVERSATION_PROTECTED_FIELDS,
                "Conversation",
                id,
              ),
            );
          }
          args.data = (Array.isArray(args.data) ? encrypted : encrypted[0]) as never;
          return query(args);
        },
        async update({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = await resolveId(
            conversationDelegate,
            args.where,
            "Conversation",
          );
          args.data = (await codec.encryptFields(
            data,
            CONVERSATION_PROTECTED_FIELDS,
            "Conversation",
            id,
          )) as never;
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          return (await decryptConversation(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async updateMany({ args, query }) {
          rejectProtectedBulkWrite(
            "Conversation",
            args.data,
            CONVERSATION_PROTECTED_FIELDS,
          );
          return query(args);
        },
        async upsert({ args, query }) {
          const existing = await conversationDelegate.findUnique({
            where: args.where,
            select: { id: true },
          });
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          args.create = (await codec.encryptFields(
            create,
            CONVERSATION_PROTECTED_FIELDS,
            "Conversation",
            createId,
          )) as never;
          args.update = (await codec.encryptFields(
            update,
            CONVERSATION_PROTECTED_FIELDS,
            "Conversation",
            existing?.id ?? createId,
          )) as never;
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          return (await decryptConversation(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async findMany({ args, query }) {
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          const rows = await query(args);
          return (await Promise.all(
            rows.map((row) =>
              decryptConversation(row as unknown as Record<string, unknown>),
            ),
          )) as never;
        },
        async findUnique({ args, query }) {
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          const row = await query(args);
          return row
            ? ((await decryptConversation(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async findFirst({ args, query }) {
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          const row = await query(args);
          return row
            ? ((await decryptConversation(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async delete({ args, query }) {
          prepareProtectedSelection(
            args as unknown as Record<string, unknown>,
            "Conversation",
          );
          return (await decryptConversation(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
      },

      message: {
        async create({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = codec.ensureRecordId(data);
          args.data = (await codec.encryptFields(
            data,
            MESSAGE_PROTECTED_FIELDS,
            "Message",
            id,
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          return (await decryptMessage(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          const encrypted = [];
          for (const entry of rows) {
            const data = entry as unknown as Record<string, unknown>;
            assertNoNestedProtectedMutation(data);
            const id = codec.ensureRecordId(data);
            encrypted.push(
              await codec.encryptFields(
                data,
                MESSAGE_PROTECTED_FIELDS,
                "Message",
                id,
              ),
            );
          }
          args.data = (Array.isArray(args.data) ? encrypted : encrypted[0]) as never;
          return query(args);
        },
        async update({ args, query }) {
          const data = args.data as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(data);
          const id = await resolveId(messageDelegate, args.where, "Message");
          args.data = (await codec.encryptFields(
            data,
            MESSAGE_PROTECTED_FIELDS,
            "Message",
            id,
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          return (await decryptMessage(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async updateMany({ args, query }) {
          rejectProtectedBulkWrite("Message", args.data, MESSAGE_PROTECTED_FIELDS);
          return query(args);
        },
        async upsert({ args, query }) {
          const existing = await messageDelegate.findUnique({
            where: args.where,
            select: { id: true },
          });
          const create = args.create as unknown as Record<string, unknown>;
          const update = args.update as unknown as Record<string, unknown>;
          assertNoNestedProtectedMutation(create);
          assertNoNestedProtectedMutation(update);
          const createId = codec.ensureRecordId(create);
          args.create = (await codec.encryptFields(
            create,
            MESSAGE_PROTECTED_FIELDS,
            "Message",
            createId,
          )) as never;
          args.update = (await codec.encryptFields(
            update,
            MESSAGE_PROTECTED_FIELDS,
            "Message",
            existing?.id ?? createId,
          )) as never;
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          return (await decryptMessage(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
        async findMany({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          const rows = await query(args);
          return (await Promise.all(
            rows.map((row) =>
              decryptMessage(row as unknown as Record<string, unknown>),
            ),
          )) as never;
        },
        async findUnique({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          const row = await query(args);
          return row
            ? ((await decryptMessage(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async findFirst({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          const row = await query(args);
          return row
            ? ((await decryptMessage(
                row as unknown as Record<string, unknown>,
              )) as never)
            : null;
        },
        async delete({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>, "Message");
          return (await decryptMessage(
            (await query(args)) as unknown as Record<string, unknown>,
          )) as never;
        },
      },

      delivery: {
        async findMany({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>);
          const rows = await query(args);
          return (await Promise.all(rows.map((row) => codec.decryptNested(row)))) as never;
        },
        async findUnique({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>);
          const row = await query(args);
          return row ? ((await codec.decryptNested(row)) as never) : null;
        },
        async findFirst({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>);
          const row = await query(args);
          return row ? ((await codec.decryptNested(row)) as never) : null;
        },
      },

      return: {
        async findMany({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>);
          const rows = await query(args);
          return (await Promise.all(rows.map((row) => codec.decryptNested(row)))) as never;
        },
        async findUnique({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>);
          const row = await query(args);
          return row ? ((await codec.decryptNested(row)) as never) : null;
        },
        async findFirst({ args, query }) {
          prepareProtectedSelection(args as unknown as Record<string, unknown>);
          const row = await query(args);
          return row ? ((await codec.decryptNested(row)) as never) : null;
        },
      },
    },
  });
}
