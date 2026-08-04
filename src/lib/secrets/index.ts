/**
 * Secrets service — contextual encrypted key/value store backed by `Secret`.
 *
 * Phase 4 stores the complete authenticated protected-value envelope in the
 * existing `ciphertext` column and uses fixed non-secret sentinels in the legacy
 * `iv`/`tag` columns. This avoids a second secret authority while registered
 * shops migrate in place. Legacy three-column AES-GCM rows remain readable only
 * as migration input; all new writes use the purpose-separated shop-secret key.
 */
import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  decryptString,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import {
  isProtectedValueEnvelope,
  openProtectedString,
  sealProtectedString,
  type ShopRecordProtectedValueBinding,
} from "@/lib/crypto/protected-value";
import { processShopContext, type ShopContext } from "@/lib/shops/context";

export const PROTECTED_SECRET_SENTINEL = "sahelflow-protected-value-v1";

export interface SecretRow {
  key: string;
  ciphertext: string;
  iv: string;
  tag: string;
  createdAt: Date;
  updatedAt: Date;
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

async function resolveSecretAuthority(context: ServiceContext) {
  return resolveShopProtectedKey(authorityClient(context), "shop-secret", {
    shopContext: shopContext(context),
  });
}

/** Get a decrypted secret value, or null if it does not exist. */
export async function getSecret(
  context: ServiceContext,
  key: string,
): Promise<string | null> {
  const row = await context.prisma.secret.findUnique({ where: { key } });
  if (!row) return null;

  if (isProtectedValueEnvelope(row.ciphertext)) {
    const contextValue = shopContext(context);
    const authority = await resolveSecretAuthority(context);
    return openProtectedString(
      row.ciphertext,
      authority.key,
      authority.descriptor,
      secretBinding(contextValue, key),
    );
  }

  // Legacy migration input. Corrupt/wrong-key payloads fail with a typed
  // protected-data error from `decryptString`; raw ciphertext is never returned.
  return decryptString(rowToLegacyPayload(row), getMasterKey());
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

/** Set or replace a secret under the canonical shop-secret key. */
export async function setSecret(
  context: ServiceContext,
  key: string,
  value: string,
): Promise<void> {
  const contextValue = shopContext(context);
  const authority = await resolveSecretAuthority(context);
  const protectedValue = sealProtectedString(
    value,
    authority.key,
    authority.descriptor,
    secretBinding(contextValue, key),
  );
  const data = {
    ciphertext: protectedValue,
    iv: PROTECTED_SECRET_SENTINEL,
    tag: PROTECTED_SECRET_SENTINEL,
  };
  await context.prisma.secret.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
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
