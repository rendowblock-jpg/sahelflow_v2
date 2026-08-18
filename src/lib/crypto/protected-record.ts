import "server-only";

import { createHmac } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import { classifyProtectedValue } from "@/lib/crypto/protected-value-classification";
import {
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
  createIfMissing?: boolean;
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
    createIfMissing: options.createIfMissing ?? true,
  });
  return sealProtectedString(
    plaintext,
    authority.key,
    authority.descriptor,
    binding(context, reference),
  );
}

export async function openShopRecordField(
  prisma: ProtectedRecordClient,
  encoded: string,
  reference: ProtectedRecordReference,
  options: ProtectedRecordOptions = {},
): Promise<string> {
  if (classifyProtectedValue(encoded) !== "canonical") {
    throw new TypeError("Protected record field is not a contextual envelope");
  }
  const context = options.shopContext ?? processShopContext();
  const authority = await resolveShopProtectedKey(prisma, "shop-data", {
    shopContext: context,
    installationRoot: options.installationRoot,
    createIfMissing: options.createIfMissing ?? false,
  });
  return openProtectedString(
    encoded,
    authority.key,
    authority.descriptor,
    binding(context, reference),
  );
}

export async function deriveShopBlindIndexes(
  prisma: ProtectedRecordClient,
  values: readonly string[],
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
  options: ProtectedRecordOptions & {
    normalize?: (value: string) => string;
  } = {},
): Promise<string[]> {
  if (values.length === 0) return [];
  const context = options.shopContext ?? processShopContext();
  const authority = await resolveShopProtectedKey(
    prisma,
    "shop-blind-index",
    {
      shopContext: context,
      installationRoot: options.installationRoot,
      createIfMissing: options.createIfMissing ?? true,
    },
  );
  const normalize =
    options.normalize ?? ((entry: string) => entry.trim().toLowerCase());
  const indexContext = blindIndexContext(context, reference);
  return values.map((value) =>
    createHmac("sha256", authority.key)
      .update(BLIND_INDEX_DOMAIN)
      .update(indexContext)
      .update(Buffer.from([0]))
      .update(normalize(value), "utf8")
      .digest("hex"),
  );
}

export async function deriveShopBlindIndex(
  prisma: ProtectedRecordClient,
  value: string,
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
  options: ProtectedRecordOptions & {
    normalize?: (value: string) => string;
  } = {},
): Promise<string> {
  const [index] = await deriveShopBlindIndexes(prisma, [value], reference, options);
  return index!;
}

/** Return current contextual indexes without creating authority on a read. */
export async function deriveExistingShopBlindIndexes(
  prisma: ProtectedRecordClient,
  values: readonly string[],
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
  options: Omit<ProtectedRecordOptions, "createIfMissing"> & {
    normalize?: (value: string) => string;
  } = {},
): Promise<string[] | null> {
  if (values.length === 0) return [];
  const existing = await prisma.protectedKeyAuthority.findUnique({
    where: { purpose: "shop-blind-index" },
    select: { purpose: true },
  });
  if (!existing) return null;
  return deriveShopBlindIndexes(prisma, values, reference, {
    ...options,
    createIfMissing: false,
  });
}

/** Return the current contextual index without creating authority on a read. */
export async function deriveExistingShopBlindIndex(
  prisma: ProtectedRecordClient,
  value: string,
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
  options: Omit<ProtectedRecordOptions, "createIfMissing"> & {
    normalize?: (value: string) => string;
  } = {},
): Promise<string | null> {
  const indexes = await deriveExistingShopBlindIndexes(
    prisma,
    [value],
    reference,
    options,
  );
  return indexes?.[0] ?? null;
}
