import "server-only";

import { createHmac } from "node:crypto";

import { getMasterKey } from "@/lib/crypto/master-key";

const COMMAND_FORMAT_VERSION = 1 as const;
const COMMAND_KEY_DOMAIN = Buffer.from(
  "sahelflow.shop-lifecycle.command.key.v1",
  "utf8",
);
const COMMAND_MAC_DOMAIN = Buffer.from(
  "sahelflow.shop-lifecycle.command.v1",
  "utf8",
);
const MAX_COMMAND_LIFETIME_MS = 60_000;
const MAX_REAUTHENTICATION_AGE_MS = 10 * 60 * 1_000;

export type NativeShopLifecycleOperation =
  | "create"
  | "rename"
  | "switch"
  | "archive"
  | "recover"
  | "delete";

export type NativeShopLifecycleRequest = Readonly<{
  formatVersion: 1;
  operationId: string;
  operation: NativeShopLifecycleOperation;
  expectedRegistryRevision: number;
  workspaceId: string;
  installationId: string;
  actorPersonId: string;
  actorMemberId: string;
  actorDeviceId: string;
  actorSessionId: string;
  policyVersion: number;
  revocationEpoch: number;
  entitlementId: string;
  entitlementRevision: number;
  shopSlots: number;
  migrationSetSha256: string;
  currentShopId: string;
  currentShopIncarnationId: string;
  targetShopId: string | null;
  targetShopIncarnationId: string | null;
  recentOwnerReauthentication: boolean;
}>;

export type NativeShopLifecyclePayload =
  | Readonly<{ operation: "create"; name: string; icon: string | null }>
  | Readonly<{ operation: "rename"; name: string }>
  | Readonly<{ operation: "switch" }>
  | Readonly<{ operation: "archive" }>
  | Readonly<{ operation: "recover"; archiveId: string }>
  | Readonly<{
      operation: "delete";
      confirmationShopId: string;
      reauthenticatedAtUnixMs: number;
    }>;

export type NativeShopLifecycleAuthorization = Readonly<{
  formatVersion: 1;
  issuedAtUnixMs: number;
  expiresAtUnixMs: number;
  request: NativeShopLifecycleRequest;
  payload: NativeShopLifecyclePayload;
}>;

export type NativeShopLifecycleCommand = Readonly<{
  authorization: NativeShopLifecycleAuthorization;
  mac: string;
}>;

class FrameWriter {
  private readonly chunks: Buffer[] = [];

  u8(value: number): void {
    const output = Buffer.allocUnsafe(1);
    output.writeUInt8(value);
    this.chunks.push(output);
  }

  u64(value: number): void {
    assertUnsignedSafeInteger(value, "framed integer");
    const output = Buffer.allocUnsafe(8);
    output.writeBigUInt64BE(BigInt(value));
    this.chunks.push(output);
  }

  bytes(value: Buffer): void {
    this.chunks.push(value);
  }

  string(value: string): void {
    const encoded = Buffer.from(value, "utf8");
    this.u64(encoded.length);
    this.bytes(encoded);
  }

  optionalString(value: string | null): void {
    if (value === null) {
      this.u8(0);
      return;
    }
    this.u8(1);
    this.string(value);
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function assertUnsignedSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  assertUnsignedSafeInteger(value, label);
  if (value === 0) throw new TypeError(`${label} must be positive`);
}

function assertHex(value: string, bytes: number, label: string): void {
  if (!new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value)) {
    throw new TypeError(`${label} must be exactly ${bytes} bytes of hex`);
  }
}

function assertLowerHex(value: string, bytes: number, label: string): void {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new TypeError(`${label} must be exactly ${bytes} bytes of lowercase hex`);
  }
}

function assertShopId(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertExactText(
  value: string,
  label: string,
  maximumCodePoints: number,
): void {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    [...value].length > maximumCodePoints ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
}

function operationCode(operation: NativeShopLifecycleOperation): number {
  switch (operation) {
    case "create":
      return 1;
    case "rename":
      return 2;
    case "switch":
      return 3;
    case "archive":
      return 4;
    case "recover":
      return 5;
    case "delete":
      return 6;
  }
}

function validateRequest(request: NativeShopLifecycleRequest): void {
  if (request.formatVersion !== COMMAND_FORMAT_VERSION) {
    throw new TypeError("Unsupported native lifecycle request format");
  }
  assertHex(request.operationId, 16, "operationId");
  assertPositiveSafeInteger(
    request.expectedRegistryRevision,
    "expectedRegistryRevision",
  );
  assertHex(request.workspaceId, 16, "workspaceId");
  assertHex(request.installationId, 16, "installationId");
  assertHex(request.actorPersonId, 16, "actorPersonId");
  assertHex(request.actorMemberId, 16, "actorMemberId");
  assertHex(request.actorDeviceId, 16, "actorDeviceId");
  if (
    request.actorSessionId.length === 0 ||
    request.actorSessionId.length > 256 ||
    request.actorSessionId !== request.actorSessionId.trim()
  ) {
    throw new TypeError("actorSessionId is invalid");
  }
  assertPositiveSafeInteger(request.policyVersion, "policyVersion");
  assertUnsignedSafeInteger(request.revocationEpoch, "revocationEpoch");
  if (
    request.entitlementId.length === 0 ||
    request.entitlementId.length > 256 ||
    request.entitlementId !== request.entitlementId.trim()
  ) {
    throw new TypeError("entitlementId is invalid");
  }
  assertPositiveSafeInteger(request.entitlementRevision, "entitlementRevision");
  if (!Number.isSafeInteger(request.shopSlots) || request.shopSlots < 1 || request.shopSlots > 10) {
    throw new TypeError("shopSlots is outside the signed launch range");
  }
  assertHex(request.migrationSetSha256, 32, "migrationSetSha256");
  assertShopId(request.currentShopId, "currentShopId");
  assertHex(
    request.currentShopIncarnationId,
    16,
    "currentShopIncarnationId",
  );

  const requiresTarget = request.operation !== "create";
  const hasTargetId = request.targetShopId !== null;
  const hasTargetIncarnation = request.targetShopIncarnationId !== null;
  if (hasTargetId !== hasTargetIncarnation) {
    throw new TypeError("Target shop identity is incomplete");
  }
  if (requiresTarget && !hasTargetId) {
    throw new TypeError("Target shop identity is required");
  }
  if (!requiresTarget && hasTargetId) {
    throw new TypeError("Create cannot carry an existing target shop");
  }
  if (request.targetShopId !== null) {
    assertShopId(request.targetShopId, "targetShopId");
    assertHex(
      request.targetShopIncarnationId ?? "",
      16,
      "targetShopIncarnationId",
    );
    if (
      request.operation === "switch" &&
      request.targetShopId === request.currentShopId
    ) {
      throw new TypeError("Switch target must differ from the current shop");
    }
  }
  if (request.operation === "delete" && !request.recentOwnerReauthentication) {
    throw new TypeError("Delete requires recent owner reauthentication");
  }
}

function validatePayload(
  authorization: NativeShopLifecycleAuthorization,
): void {
  const { payload, request, issuedAtUnixMs } = authorization;
  if (payload.operation !== request.operation) {
    throw new TypeError("Lifecycle operation and payload do not match");
  }
  switch (payload.operation) {
    case "create":
      assertExactText(payload.name, "shop name", 50);
      if (
        payload.icon !== null &&
        (Buffer.byteLength(payload.icon, "utf8") > 32 || /\p{Cc}/u.test(payload.icon))
      ) {
        throw new TypeError("shop icon is invalid");
      }
      break;
    case "rename":
      assertExactText(payload.name, "shop name", 50);
      break;
    case "recover":
      assertLowerHex(payload.archiveId, 16, "archiveId");
      break;
    case "delete":
      if (payload.confirmationShopId !== request.targetShopId) {
        throw new TypeError("Delete confirmation does not match the target shop");
      }
      assertUnsignedSafeInteger(
        payload.reauthenticatedAtUnixMs,
        "reauthenticatedAtUnixMs",
      );
      if (payload.reauthenticatedAtUnixMs > issuedAtUnixMs) {
        throw new TypeError("Reauthentication proof is future-dated");
      }
      if (
        issuedAtUnixMs - payload.reauthenticatedAtUnixMs >
        MAX_REAUTHENTICATION_AGE_MS
      ) {
        throw new TypeError("Reauthentication proof is stale");
      }
      break;
    case "switch":
    case "archive":
      break;
  }
}

function validateAuthorization(
  authorization: NativeShopLifecycleAuthorization,
): void {
  if (authorization.formatVersion !== COMMAND_FORMAT_VERSION) {
    throw new TypeError("Unsupported native lifecycle command format");
  }
  assertPositiveSafeInteger(authorization.issuedAtUnixMs, "issuedAtUnixMs");
  assertPositiveSafeInteger(authorization.expiresAtUnixMs, "expiresAtUnixMs");
  if (
    authorization.expiresAtUnixMs <= authorization.issuedAtUnixMs ||
    authorization.expiresAtUnixMs - authorization.issuedAtUnixMs >
      MAX_COMMAND_LIFETIME_MS
  ) {
    throw new TypeError("Native lifecycle command validity window is invalid");
  }
  validateRequest(authorization.request);
  validatePayload(authorization);
}

function frameRequest(
  writer: FrameWriter,
  request: NativeShopLifecycleRequest,
): void {
  writer.u8(operationCode(request.operation));
  writer.string(request.operationId);
  writer.u64(request.expectedRegistryRevision);
  writer.string(request.workspaceId);
  writer.string(request.installationId);
  writer.string(request.actorPersonId);
  writer.string(request.actorMemberId);
  writer.string(request.actorDeviceId);
  writer.string(request.actorSessionId);
  writer.u64(request.policyVersion);
  writer.u64(request.revocationEpoch);
  writer.string(request.entitlementId);
  writer.u64(request.entitlementRevision);
  writer.u64(request.shopSlots);
  writer.string(request.migrationSetSha256);
  writer.string(request.currentShopId);
  writer.string(request.currentShopIncarnationId);
  writer.optionalString(request.targetShopId);
  writer.optionalString(request.targetShopIncarnationId);
  writer.u8(request.recentOwnerReauthentication ? 1 : 0);
}

function framePayload(
  writer: FrameWriter,
  payload: NativeShopLifecyclePayload,
): void {
  writer.u8(operationCode(payload.operation));
  switch (payload.operation) {
    case "create":
      writer.string(payload.name);
      writer.optionalString(payload.icon);
      break;
    case "rename":
      writer.string(payload.name);
      break;
    case "recover":
      writer.string(payload.archiveId);
      break;
    case "delete":
      writer.string(payload.confirmationShopId);
      writer.u64(payload.reauthenticatedAtUnixMs);
      break;
    case "switch":
    case "archive":
      break;
  }
}

export function nativeShopLifecycleAuthorizationBytes(
  authorization: NativeShopLifecycleAuthorization,
): Buffer {
  validateAuthorization(authorization);
  const writer = new FrameWriter();
  writer.bytes(COMMAND_MAC_DOMAIN);
  writer.u8(0);
  writer.u8(authorization.formatVersion);
  writer.u64(authorization.issuedAtUnixMs);
  writer.u64(authorization.expiresAtUnixMs);
  frameRequest(writer, authorization.request);
  framePayload(writer, authorization.payload);
  return writer.finish();
}

export function signNativeShopLifecycleAuthorization(
  authorization: NativeShopLifecycleAuthorization,
): NativeShopLifecycleCommand {
  const root = getMasterKey();
  if (root.length !== 32) {
    throw new Error("Installation root must be exactly 256 bits");
  }
  const commandKey = createHmac("sha256", root)
    .update(COMMAND_KEY_DOMAIN)
    .digest();
  try {
    const mac = createHmac("sha256", commandKey)
      .update(nativeShopLifecycleAuthorizationBytes(authorization))
      .digest("hex");
    return Object.freeze({ authorization, mac });
  } finally {
    commandKey.fill(0);
  }
}
