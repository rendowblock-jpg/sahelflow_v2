import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import type { ShopContext } from "@/lib/shops/context";

const UPSERT_ID_DOMAIN = Buffer.from(
  "sahelflow.protected-upsert-record-id.v1\0",
  "utf8",
);

type ProtectedUpsertModel =
  | "Customer"
  | "Order"
  | "Conversation"
  | "Message";

type ProtectedUpsertDelegate =
  | "customer"
  | "order"
  | "conversation"
  | "message";

interface RawDelegate {
  findUnique(args: {
    where: unknown;
    select: { id: true };
  }): Promise<{ id: string } | null>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Protected upsert identity contains a non-finite number");
    }
    return value;
  }
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof Date) return { date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { bytes: value.toString("base64") };
  if (Array.isArray(value)) return value.map(canonicalValue);
  const input = record(value);
  if (!input) {
    throw new TypeError("Protected upsert identity contains an unsupported value");
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (input[key] !== undefined) output[key] = canonicalValue(input[key]);
  }
  return output;
}

function deterministicRecordId(
  context: ShopContext,
  model: ProtectedUpsertModel,
  where: unknown,
): string {
  const digest = createHash("sha256")
    .update(UPSERT_ID_DOMAIN)
    .update(
      JSON.stringify({
        workspaceId: context.workspaceId.toLowerCase(),
        shopId: context.shopId,
        shopIncarnationId: context.shopIncarnationId.toLowerCase(),
        model,
        where: canonicalValue(where),
      }),
      "utf8",
    )
    .digest("hex");
  return `sfup_${digest}`;
}

function candidateRecordId(
  create: Record<string, unknown>,
  where: unknown,
  context: ShopContext,
  model: ProtectedUpsertModel,
): string {
  if (typeof create.id === "string" && create.id) return create.id;
  const directWhereId = record(where)?.id;
  if (typeof directWhereId === "string" && directWhereId) return directWhereId;
  return deterministicRecordId(context, model, where);
}

/**
 * Stabilize the create ID before the canonical protection layer binds update
 * ciphertext. If the original unique selector already resolves, normal Prisma
 * upsert semantics remain untouched. If it is absent, every concurrent caller
 * derives the same shop-bound candidate ID and upserts through that ID, so the
 * native transaction reveals/updates the same record without speculative AAD.
 */
export function withProtectedRaceSafeUpserts<
  TClient extends Pick<PrismaClient, "$extends">,
>(
  client: TClient,
  rawAuthority: PrismaClient,
  context: ShopContext,
) {
  const codec = createProtectedPiiCodec(rawAuthority, context);
  const delegates: Record<ProtectedUpsertDelegate, RawDelegate> = {
    customer: rawAuthority.customer as unknown as RawDelegate,
    order: rawAuthority.order as unknown as RawDelegate,
    conversation: rawAuthority.conversation as unknown as RawDelegate,
    message: rawAuthority.message as unknown as RawDelegate,
  };

  async function customerExistingId(where: unknown): Promise<string | null> {
    const input = record(where);
    if (!input) return null;
    const phone = input.phone;
    if (typeof phone === "string" && !/^[0-9a-f]{64}$/.test(phone)) {
      const indexes = await codec.customerPhoneIndexes(phone);
      return (
        await rawAuthority.customer.findFirst({
          where: {
            ...input,
            phone: indexes.length === 1 ? indexes[0] : { in: indexes },
          },
          select: { id: true },
        })
      )?.id ?? null;
    }
    return (
      await rawAuthority.customer.findUnique({
        where: where as never,
        select: { id: true },
      })
    )?.id ?? null;
  }

  async function prepare(
    args: { where: unknown; create: unknown },
    model: ProtectedUpsertModel,
    delegate: ProtectedUpsertDelegate,
  ): Promise<void> {
    const create = record(args.create);
    if (!create) throw new TypeError(`${model} upsert create data is invalid`);
    const originalWhere = args.where;
    const id = candidateRecordId(create, originalWhere, context, model);
    create.id = id;

    const existingId =
      delegate === "customer"
        ? await customerExistingId(originalWhere)
        : (
            await delegates[delegate].findUnique({
              where: originalWhere,
              select: { id: true },
            })
          )?.id ?? null;
    if (existingId === null) args.where = { id };
  }

  return client.$extends({
    query: {
      customer: {
        async upsert({ args, query }) {
          await prepare(args, "Customer", "customer");
          return query(args);
        },
      },
      order: {
        async upsert({ args, query }) {
          await prepare(args, "Order", "order");
          return query(args);
        },
      },
      conversation: {
        async upsert({ args, query }) {
          await prepare(args, "Conversation", "conversation");
          return query(args);
        },
      },
      message: {
        async upsert({ args, query }) {
          await prepare(args, "Message", "message");
          return query(args);
        },
      },
    },
  });
}
