import "server-only";

import { createHmac } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

const UPSERT_ID_DOMAIN = Buffer.from(
  "sahelflow.protected-upsert-record-id.v2\0",
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

function directWhereId(where: unknown): string | null {
  const value = record(where)?.id;
  return typeof value === "string" && value ? value : null;
}

function callerCreateId(create: Record<string, unknown>): string | null {
  const value = create.id;
  if (value === undefined) return null;
  if (typeof value !== "string" || !value) {
    throw new TypeError("Protected upsert create identity is invalid");
  }
  return value;
}

function assertCompatibleCreateId(
  createId: string | null,
  authoritativeId: string,
  model: ProtectedUpsertModel,
): void {
  if (createId !== null && createId !== authoritativeId) {
    throw new SahelFlowError(
      `${model} upsert create identity conflicts with its authoritative selector`,
      "PROTECTED_DATA_UPSERT_ID_AMBIGUOUS",
      409,
    );
  }
}

/**
 * A protected upsert on an alternate unique selector cannot safely honor an
 * arbitrary caller-supplied create ID: competing callers could bind update
 * ciphertext to different speculative IDs. Require the canonical layer to
 * derive one shop-keyed pseudonymous ID instead.
 */
function assertNoAmbiguousCreateId(
  createId: string | null,
  model: ProtectedUpsertModel,
): void {
  if (createId === null) return;
  throw new SahelFlowError(
    `${model} protected upsert cannot supply a create ID with an alternate unique selector`,
    "PROTECTED_DATA_UPSERT_ID_AMBIGUOUS",
    409,
  );
}

/**
 * Derive a race-only stable ID with the purpose-separated shop blind-index key.
 * The unique selector can contain a phone, JID or other low-entropy identifier;
 * an unkeyed digest would make the durable record ID dictionary-checkable.
 */
async function keyedRecordId(
  rawAuthority: PrismaClient,
  context: ShopContext,
  model: ProtectedUpsertModel,
  where: unknown,
): Promise<string> {
  const authority = await resolveShopProtectedKey(
    rawAuthority,
    "shop-blind-index",
    { shopContext: context },
  );
  const identity = Buffer.from(
    JSON.stringify({
      formatVersion: 2,
      workspaceId: context.workspaceId.toLowerCase(),
      shopId: context.shopId,
      shopIncarnationId: context.shopIncarnationId.toLowerCase(),
      model,
      where: canonicalValue(where),
    }),
    "utf8",
  );
  return `sfup_${createHmac("sha256", authority.key)
    .update(UPSERT_ID_DOMAIN)
    .update(identity)
    .digest("hex")}`;
}

/**
 * Stabilize the create ID before the canonical protection layer binds update
 * ciphertext. If the original unique selector resolves, its durable row ID is
 * authoritative. If it is absent, every concurrent caller derives the same
 * secret-keyed, shop-bound candidate and upserts through that ID, so no update
 * branch can carry ciphertext authenticated to a losing speculative identity.
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

  async function existingId(
    where: unknown,
    delegate: ProtectedUpsertDelegate,
  ): Promise<string | null> {
    if (delegate === "customer") return customerExistingId(where);
    return (
      await delegates[delegate].findUnique({
        where,
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
    const suppliedCreateId = callerCreateId(create);
    const resolvedId = await existingId(originalWhere, delegate);
    if (resolvedId !== null) {
      // The create branch is normally unused, but pinning it to the durable ID
      // also keeps a concurrent delete/recreate transition record-bound.
      create.id = resolvedId;
      return;
    }

    const selectorId = directWhereId(originalWhere);
    if (selectorId !== null) {
      assertCompatibleCreateId(suppliedCreateId, selectorId, model);
      create.id = selectorId;
      return;
    }

    assertNoAmbiguousCreateId(suppliedCreateId, model);
    const id = await keyedRecordId(rawAuthority, context, model, originalWhere);
    create.id = id;
    args.where = { id };
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
