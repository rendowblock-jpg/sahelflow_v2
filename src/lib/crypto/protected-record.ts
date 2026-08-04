import "server-only";

import { createHmac } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import {
  isProtectedValueEnvelope,
  openProtectedString,
  sealProtectedString,
  type ShopRecordProtectedValueBinding,
} from "@/lib/crypto/protected-value";
import {
  processShopContext,
  type ShopContext,
} from "@/lib/shops/context";

const BLIND_INDEX_DOMAIN = Buffer.from(
  "sahelflow.shop-blind-index.v1\0",
  "utf8",
);

type ProtectedRecordClient = Pick<PrismaClient, "protectedKeyAuthority">;

export interface ProtectedRecordReference {
  recordType: string;
  recordId: string;
  field: string;
}

export interface ProtectedRecordOptions {
  shopContext?: ShopContext;
  installationRoot?: Buffer;
}

function assertIdentifier(
  value: string,
  label: string,
  maximum: number,
): void {
  if (
    !value ||
    value !== value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertReference(reference: ProtectedRecordReference): void {
  assertIdentifier(reference.recordType, "Record type", 128);
  assertIdentifier(reference.recordId, "Record ID", 256);
  assertIdentifier(reference.field, "Protected field", 128);
}

function binding(
  context: ShopContext,
  reference: ProtectedRecordReference,
): ShopRecordProtectedValueBinding {
  assertReference(reference);
  return {
    scope: "shop-record",
    workspaceId: context.workspaceId,
    shopId: context.shopId,
    shopIncarnationId: context.shopIncarnationId,
    ...reference,
  };
}

function blindIndexContext(
  context: ShopContext,
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
): Buffer {
  assertIdentifier(reference.recordType, "Record type", 128);
  assertIdentifier(reference.field, "Blind-index field", 128);
  return Buffer.from(
    JSON.stringify({
      formatVersion: 1,
      workspaceId: context.workspaceId.toLowerCase(),
      shopId: context.shopId,
      shopIncarnationId: context.shopIncarnationId.toLowerCase(),
      recordType: reference.recordType,
      field: reference.field,
    }),
    "utf8",
  );
}

/** Encrypt one seller field under the current purpose-specific shop data key. */
export async function sealShopRecordField(
  prisma: ProtectedRecordClient,
  plaintext: string,
  reference: ProtectedRecordReference,
  options: ProtectedRecordOptions = {},
): Promise<string> {
  const context = options.shopContext ?? processShopContext();
  const authority = await resolveShopProtectedKey(prisma, "shop-data", {
    shopContext: context,
    installationRoot: options.installationRoot,
  });
  return sealProtectedString(
    plaintext,
    authority.key,
    authority.descriptor,
    binding(context, reference),
  );
}

/**
 * Decrypt one contextual seller field. Legacy payloads are deliberately not
 * accepted here; the migration layer must classify and rewrite them before the
 * canonical protected-record reader owns the field.
 */
export async function openShopRecordField(
  prisma: ProtectedRecordClient,
  encoded: string,
  reference: ProtectedRecordReference,
  options: ProtectedRecordOptions = {},
): Promise<string> {
  if (!isProtectedValueEnvelope(encoded)) {
    throw new TypeError("Protected record field is not a contextual envelope");
  }
  const context = options.shopContext ?? processShopContext();
  const authority = await resolveShopProtectedKey(prisma, "shop-data", {
    shopContext: context,
    installationRoot: options.installationRoot,
  });
  return openProtectedString(
    encoded,
    authority.key,
    authority.descriptor,
    binding(context, reference),
  );
}

/**
 * Derive a purpose-separated exact-match index. Context excludes record ID so
 * the same normalized value remains searchable within one field of one shop
 * incarnation, while cross-field/shop/workspace correlation is prevented.
 */
export async function deriveShopBlindIndex(
  prisma: ProtectedRecordClient,
  value: string,
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
  options: ProtectedRecordOptions & {
    normalize?: (value: string) => string;
  } = {},
): Promise<string> {
  const context = options.shopContext ?? processShopContext();
  const authority = await resolveShopProtectedKey(
    prisma,
    "shop-blind-index",
    {
      shopContext: context,
      installationRoot: options.installationRoot,
    },
  );
  const normalized = (options.normalize ?? ((entry: string) => entry.trim().toLowerCase()))(
    value,
  );
  return createHmac("sha256", authority.key)
    .update(BLIND_INDEX_DOMAIN)
    .update(blindIndexContext(context, reference))
    .update(Buffer.from([0]))
    .update(normalized, "utf8")
    .digest("hex");
}
