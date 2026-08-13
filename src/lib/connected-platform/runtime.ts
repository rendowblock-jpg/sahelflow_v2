import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { env } from "@/lib/env";
import { createSecretIfAbsent, getSecret, setSecret } from "@/lib/secrets";
import { signedEntitlementSchema } from "@/lib/license/entitlement";
import { ConnectedPlatformClient } from "./client";
import { generateConnectedKeyPair } from "./payload-crypto";

export const CONNECTED_CONTROL_TOKEN_SECRET = "connected_control_token";
export const CONNECTED_BACKUP_TOKEN_SECRET = "connected_backup_token";
export const STOREFRONT_RECEIPT_KEYS_SECRET = "connected_storefront_receipt_keys_v1";
export const CONNECTED_DESKTOP_KEYS_SECRET = "connected_desktop_keys_v1";

export type StorefrontReceiptKeys = Readonly<{
  publicKeyJwk: string;
  privateKeyPkcs8: string;
}>;

type ConnectedDesktopKeys = Readonly<{
  signingPublicKey: string;
  signingPrivateKeyPkcs8: string;
  encryptionPublicKeyJwk: string;
  encryptionPrivateKeyPkcs8: string;
}>;

function configuredEndpoints() {
  if (
    !env.connectedControlOrigin ||
    !env.connectedStorefrontOrigin ||
    !env.connectedBackupOrigin
  ) {
    return null;
  }
  return {
    control: env.connectedControlOrigin,
    storefront: env.connectedStorefrontOrigin,
    backup: env.connectedBackupOrigin,
  };
}

function endpoints() {
  const configured = configuredEndpoints();
  if (!configured) throw new Error("Connected platform service origins are not configured");
  return configured;
}

function parseDesktopKeys(value: string): ConnectedDesktopKeys {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Connected desktop keys are unreadable"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Connected desktop keys are invalid");
  }
  const row = parsed as Record<string, unknown>;
  for (const key of [
    "signingPublicKey",
    "signingPrivateKeyPkcs8",
    "encryptionPublicKeyJwk",
    "encryptionPrivateKeyPkcs8",
  ] as const) {
    const value = row[key];
    if (typeof value !== "string" || value.length < 32 || value.length > 16_384) {
      throw new Error("Connected desktop keys are invalid");
    }
  }
  return Object.freeze({
    signingPublicKey: row.signingPublicKey as string,
    signingPrivateKeyPkcs8: row.signingPrivateKeyPkcs8 as string,
    encryptionPublicKeyJwk: row.encryptionPublicKeyJwk as string,
    encryptionPrivateKeyPkcs8: row.encryptionPrivateKeyPkcs8 as string,
  });
}

async function ensureConnectedDesktopKeys(context: ServiceContext): Promise<ConnectedDesktopKeys> {
  const existing = await getSecret(context, CONNECTED_DESKTOP_KEYS_SECRET);
  if (existing) return parseDesktopKeys(existing);
  const generated = generateConnectedKeyPair();
  await createSecretIfAbsent(context, CONNECTED_DESKTOP_KEYS_SECRET, JSON.stringify(generated));
  const winner = await getSecret(context, CONNECTED_DESKTOP_KEYS_SECRET);
  if (!winner) throw new Error("Connected desktop key authority was not persisted");
  return parseDesktopKeys(winner);
}

export async function refreshConnectedEnrollmentIfConfigured(
  context: ServiceContext,
  rawEntitlement: unknown,
): Promise<Readonly<{ configured: boolean; connected: boolean; backup: boolean }>> {
  const serviceEndpoints = configuredEndpoints();
  if (!serviceEndpoints) return Object.freeze({ configured: false, connected: false, backup: false });
  const entitlement = signedEntitlementSchema.parse(rawEntitlement);
  const complete = entitlement.claims.features.includes("sahelflow.complete");
  const connected = complete || entitlement.claims.features.includes("sahelflow.connected") ||
    entitlement.claims.features.includes("sahelflow.storefront");
  const backup = complete || entitlement.claims.features.includes("sahelflow.backup");
  if (!connected && !backup) {
    return Object.freeze({ configured: true, connected: false, backup: false });
  }
  const keys = await ensureConnectedDesktopKeys(context);
  const client = new ConnectedPlatformClient({
    endpoints: serviceEndpoints,
    controlToken: async () => { throw new Error("Connected enrollment has no bearer authority yet"); },
  });
  if (connected) {
    const result = await client.bootstrapConnected(
      entitlement,
      keys.signingPublicKey,
      keys.encryptionPublicKeyJwk,
    );
    if (result.workspaceId !== entitlement.claims.workspaceId) {
      throw new Error("Connected enrollment returned another workspace authority");
    }
    await setSecret(context, CONNECTED_CONTROL_TOKEN_SECRET, result.desktopToken);
  }
  if (backup) {
    const result = await client.bootstrapBackup(entitlement, keys.signingPublicKey);
    if (result.workspaceId !== entitlement.claims.workspaceId) {
      throw new Error("Backup enrollment returned another workspace authority");
    }
    await setSecret(context, CONNECTED_BACKUP_TOKEN_SECRET, result.backupToken);
  }
  return Object.freeze({ configured: true, connected, backup });
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
