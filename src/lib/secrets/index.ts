/**
 * Secrets service — contextual encrypted key/value store backed by `Secret`.
 *
 * Phase 4 stores the complete authenticated protected-value envelope in the
 * existing `ciphertext` column. The legacy `iv`/`tag` columns retain the public
 * nonce/tag from that same envelope for compatibility diagnostics; they are not
 * a second decryption authority. Legacy three-column AES-GCM rows remain
 * readable only as migration input; all new writes use the purpose-separated
 * shop-secret key.
 */
import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  decryptString,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import { classifyProtectedValue } from "@/lib/crypto/protected-value-classification";
import {
  openProtectedString,
  sealProtectedString,
  type ShopRecordProtectedValueBinding,
} from "@/lib/crypto/protected-value";
import { processShopContext, type ShopContext } from "@/lib/shops/context";

export interface SecretRow {
  key: string;
  ciphertext: string;
  iv: string;
  tag: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretCryptoOptions {
  installationRoot?: Buffer;
  createIfMissing?: boolean;
}

type KeyAuthorityClient = Parameters<typeof resolveShopProtectedKey>[0];

function authorityClient(context: ServiceContext): KeyAuthorityClient {
  return context.prisma as unknown as KeyAuthorityClient;
}

function shopContext(context: ServiceContext): ShopContext {
  return context.shop ?? processShopContext();
}

function secretBinding(
  context: ShopContext,
  key: string,
): ShopRecordProtectedValueBinding {
  if (!key || key !== key.trim() || key.length > 256 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new TypeError("Secret key is invalid");
  }
  return {
    scope: "shop-record",
    workspaceId: context.workspaceId,
    shopId: context.shopId,
    shopIncarnationId: context.shopIncarnationId,
    recordType: "Secret",
    recordId: key,
    field: "value",
  };
}

function rowToLegacyPayload(row: SecretRow): EncryptedPayload {
  return { iv: row.iv, ciphertext: row.ciphertext, tag: row.tag };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

async function resolveSecretAuthority(
  context: ServiceContext,
  options: SecretCryptoOptions = {},
) {
  return resolveShopProtectedKey(authorityClient(context), "shop-secret", {
    shopContext: shopContext(context),
    installationRoot: options.installationRoot,
    createIfMissing: options.createIfMissing,
  });
}

async function protectedSecretData(
  context: ServiceContext,
  key: string,
  value: string,
  options: SecretCryptoOptions = {},
): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const contextValue = shopContext(context);
  const authority = await resolveSecretAuthority(context, {
    ...options,
    createIfMissing: true,
  });
  const ciphertext = sealProtectedString(
    value,
    authority.key,
    authority.descriptor,
    secretBinding(contextValue, key),
  );
  const envelope = JSON.parse(ciphertext) as { iv?: unknown; tag?: unknown };
  if (typeof envelope.iv !== "string" || typeof envelope.tag !== "string") {
    throw new Error("Canonical secret envelope omitted public nonce/tag metadata");
  }
  return { ciphertext, iv: envelope.iv, tag: envelope.tag };
}

/** Get a decrypted secret value, or null if it doesn't exist. */
export async function getSecret(
  context: ServiceContext,
  key: string,
  options: SecretCryptoOptions = {},
): Promise<string | null> {
  const row = await context.prisma.secret.findUnique({ where: { key } });
  if (!row) return null;

  if (classifyProtectedValue(row.ciphertext) === "canonical") {
    const contextValue = shopContext(context);
    const authority = await resolveSecretAuthority(context, {
      ...options,
      createIfMissing: false,
    });
    return openProtectedString(
      row.ciphertext,
      authority.key,
      authority.descriptor,
      secretBinding(contextValue, key),
    );
  }

  return decryptString(
    rowToLegacyPayload(row),
    options.installationRoot ?? getMasterKey(),
  );
}

export async function hasSecret(
  context: ServiceContext,
  key: string,
): Promise<boolean> {
  const row = await context.prisma.secret.findUnique({
    where: { key },
    select: { id: true },
  });
  return row !== null;
}

export async function setSecret(
  context: ServiceContext,
  key: string,
  value: string,
  options: SecretCryptoOptions = {},
): Promise<void> {
  const data = await protectedSecretData(context, key, value, options);
  await context.prisma.secret.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
}

export async function createSecretIfAbsent(
  context: ServiceContext,
  key: string,
  value: string,
  options: SecretCryptoOptions = {},
): Promise<boolean> {
  const data = await protectedSecretData(context, key, value, options);
  try {
    await context.prisma.secret.create({ data: { key, ...data } });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

export async function deleteSecret(
  context: ServiceContext,
  key: string,
): Promise<void> {
  await context.prisma.secret.deleteMany({ where: { key } });
}

export async function listSecretStatus(
  context: ServiceContext,
  knownKeys: readonly string[],
): Promise<Record<string, boolean>> {
  const rows = await context.prisma.secret.findMany({
    where: { key: { in: [...knownKeys] } },
    select: { key: true },
  });
  const present = new Set(rows.map((row) => row.key));
  const output: Record<string, boolean> = {};
  for (const key of knownKeys) output[key] = present.has(key);
  return output;
}
