import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { env } from "@/lib/env";
import { createSecretIfAbsent, getSecret } from "@/lib/secrets";
import { ConnectedPlatformClient } from "./client";
import { generateConnectedKeyPair } from "./payload-crypto";

export const CONNECTED_CONTROL_TOKEN_SECRET = "connected_control_token";
export const CONNECTED_BACKUP_TOKEN_SECRET = "connected_backup_token";
export const STOREFRONT_RECEIPT_KEYS_SECRET = "connected_storefront_receipt_keys_v1";

export type StorefrontReceiptKeys = Readonly<{
  publicKeyJwk: string;
  privateKeyPkcs8: string;
}>;

function endpoints() {
  if (
    !env.connectedControlOrigin ||
    !env.connectedStorefrontOrigin ||
    !env.connectedBackupOrigin
  ) {
    throw new Error("Connected platform service origins are not configured");
  }
  return {
    control: env.connectedControlOrigin,
    storefront: env.connectedStorefrontOrigin,
    backup: env.connectedBackupOrigin,
  };
}

function parseReceiptKeys(value: string): StorefrontReceiptKeys {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Storefront receipt key authority is unreadable");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Storefront receipt key authority is invalid");
  }
  const row = parsed as Record<string, unknown>;
  if (
    typeof row.publicKeyJwk !== "string" ||
    row.publicKeyJwk.length < 32 ||
    row.publicKeyJwk.length > 4_096 ||
    typeof row.privateKeyPkcs8 !== "string" ||
    row.privateKeyPkcs8.length < 32 ||
    row.privateKeyPkcs8.length > 16_384
  ) {
    throw new Error("Storefront receipt key authority is invalid");
  }
  return Object.freeze({
    publicKeyJwk: row.publicKeyJwk,
    privateKeyPkcs8: row.privateKeyPkcs8,
  });
}

export async function ensureStorefrontReceiptKeys(
  context: ServiceContext,
): Promise<StorefrontReceiptKeys> {
  const existing = await getSecret(context, STOREFRONT_RECEIPT_KEYS_SECRET);
  if (existing) return parseReceiptKeys(existing);

  const generated = generateConnectedKeyPair();
  await createSecretIfAbsent(
    context,
    STOREFRONT_RECEIPT_KEYS_SECRET,
    JSON.stringify({
      publicKeyJwk: generated.encryptionPublicKeyJwk,
      privateKeyPkcs8: generated.encryptionPrivateKeyPkcs8,
    }),
  );
  const winner = await getSecret(context, STOREFRONT_RECEIPT_KEYS_SECRET);
  if (!winner) throw new Error("Storefront receipt key authority was not persisted");
  return parseReceiptKeys(winner);
}

export async function loadStorefrontRuntime(
  context: ServiceContext,
  options: Readonly<{ createReceiptKeys?: boolean }> = {},
): Promise<Readonly<{
  client: ConnectedPlatformClient;
  receiptKeys: StorefrontReceiptKeys;
}>> {
  const [controlToken, backupToken, storedKeys] = await Promise.all([
    getSecret(context, CONNECTED_CONTROL_TOKEN_SECRET),
    getSecret(context, CONNECTED_BACKUP_TOKEN_SECRET),
    getSecret(context, STOREFRONT_RECEIPT_KEYS_SECRET),
  ]);
  if (!controlToken) throw new Error("Connected platform is not enrolled for this shop");
  const receiptKeys = storedKeys
    ? parseReceiptKeys(storedKeys)
    : options.createReceiptKeys
      ? await ensureStorefrontReceiptKeys(context)
      : null;
  if (!receiptKeys) throw new Error("Storefront receipt key authority is not enrolled");
  return Object.freeze({
    client: new ConnectedPlatformClient({
      endpoints: endpoints(),
      controlToken: async () => controlToken,
      ...(backupToken ? { backupToken: async () => backupToken } : {}),
    }),
    receiptKeys,
  });
}
