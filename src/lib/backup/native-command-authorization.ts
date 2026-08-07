import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { deriveInstallationKey } from "@/lib/crypto/key-hierarchy";
import { getMasterKey } from "@/lib/crypto/master-key";
import { processShopContext, type ShopContext } from "@/lib/shops/context";

const AUTHORIZATION_FORMAT_VERSION = 1 as const;
const AUTHORIZATION_LIFETIME_MS = 60_000;
const AUTHORIZATION_MAC_DOMAIN = Buffer.from(
  "sahelflow.native-command.authorization.v1\0",
  "utf8",
);

export const NATIVE_SURVIVABILITY_ACTIONS = {
  create: "survivability-backup:create",
  list: "survivability-backup:list",
  createKit: "survivability-kit:create",
  prepareRestore: "survivability-restore:prepare",
  delete: "survivability-backup:delete",
} as const;

export type NativeSurvivabilityAction =
  (typeof NATIVE_SURVIVABILITY_ACTIONS)[keyof typeof NATIVE_SURVIVABILITY_ACTIONS];

interface NativeCommandPayload {
  formatVersion: typeof AUTHORIZATION_FORMAT_VERSION;
  action: NativeSurvivabilityAction;
  workspaceId: string;
  installationId: string;
  issuedAtUnixMs: number;
  expiresAtUnixMs: number;
  nonce: string;
  resource: string;
}

interface CreateNativeAuthorizationInput {
  installationRoot: Buffer;
  shopContext: Pick<ShopContext, "workspaceId" | "installationId">;
  action: NativeSurvivabilityAction;
  resource: string;
  issuedAtUnixMs?: number;
  nonce?: Buffer;
}

function frame(domain: Buffer, fields: readonly Buffer[]): Buffer {
  const encoded: Buffer[] = [domain];
  for (const field of fields) {
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64LE(BigInt(field.length));
    encoded.push(length, field);
  }
  return Buffer.concat(encoded);
}

function assertResource(resource: string): void {
  if (
    resource !== "workspace" &&
    !/^backup-[0-9]{10,17}-[0-9a-f]{16}$/i.test(resource)
  ) {
    throw new TypeError("Native command resource is invalid");
  }
}

/**
 * Build one short-lived, single-use token consumed by the native desktop.
 * The token authenticates the exact workspace, installation, action and
 * resource. It is not a general session or a reusable desktop credential.
 */
export function createNativeCommandAuthorization(
  input: CreateNativeAuthorizationInput,
): string {
  assertResource(input.resource);
  const issuedAtUnixMs = input.issuedAtUnixMs ?? Date.now();
  if (!Number.isSafeInteger(issuedAtUnixMs) || issuedAtUnixMs < 0) {
    throw new TypeError("Native command issue time is invalid");
  }
  const nonce = input.nonce ?? randomBytes(16);
  if (!Buffer.isBuffer(nonce) || nonce.length !== 16) {
    throw new TypeError("Native command nonce must be 128 bits");
  }

  const payload: NativeCommandPayload = {
    formatVersion: AUTHORIZATION_FORMAT_VERSION,
    action: input.action,
    workspaceId: input.shopContext.workspaceId,
    installationId: input.shopContext.installationId,
    issuedAtUnixMs,
    expiresAtUnixMs: issuedAtUnixMs + AUTHORIZATION_LIFETIME_MS,
    nonce: nonce.toString("hex"),
    resource: input.resource,
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const derived = deriveInstallationKey(input.installationRoot, {
    workspaceId: input.shopContext.workspaceId,
    installationId: input.shopContext.installationId,
    purpose: "native-command-bridge",
    version: 1,
  });
  try {
    const mac = createHmac("sha256", derived.key)
      .update(frame(AUTHORIZATION_MAC_DOMAIN, [payloadBytes]))
      .digest("hex");
    return `${payloadBytes.toString("hex")}.${mac}`;
  } finally {
    derived.key.fill(0);
  }
}

export function issueNativeCommandAuthorization(
  action: NativeSurvivabilityAction,
  resource: string,
): string {
  return createNativeCommandAuthorization({
    installationRoot: getMasterKey(),
    shopContext: processShopContext(),
    action,
    resource,
  });
}
