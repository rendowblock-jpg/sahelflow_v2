import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { isAbsolute, join, resolve } from "node:path";

import {
  createNativeCommandAuthorization,
  NATIVE_SURVIVABILITY_ACTIONS,
  type NativeSurvivabilityAction,
} from "@/lib/backup/native-command-authorization";
import { deriveInstallationKey } from "@/lib/crypto/key-hierarchy";
import { getMasterKey } from "@/lib/crypto/master-key";
import { processShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

const ENDPOINT_FORMAT_VERSION = 1 as const;
const HANDSHAKE_FORMAT_VERSION = 1 as const;
const REQUEST_FORMAT_VERSION = 1 as const;
const RESPONSE_FORMAT_VERSION = 1 as const;
const MAX_ENDPOINT_BYTES = 16 * 1024;
const MAX_HANDSHAKE_BYTES = 16 * 1024;
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const OPERATION_TIMEOUT_MS = 30 * 60_000;
const HANDSHAKE_MAC_DOMAIN = Buffer.from(
  "sahelflow.survivability.handshake.v1\0",
  "utf8",
);

export const SURVIVABILITY_OPERATIONS = {
  createBackup: {
    operation: "create-backup",
    action: NATIVE_SURVIVABILITY_ACTIONS.create,
  },
  listBackups: {
    operation: "list-backups",
    action: NATIVE_SURVIVABILITY_ACTIONS.list,
  },
  createRecoveryKit: {
    operation: "create-recovery-kit",
    action: NATIVE_SURVIVABILITY_ACTIONS.createKit,
  },
  prepareRestore: {
    operation: "prepare-restore",
    action: NATIVE_SURVIVABILITY_ACTIONS.prepareRestore,
  },
  deleteBackup: {
    operation: "delete-backup",
    action: NATIVE_SURVIVABILITY_ACTIONS.delete,
  },
} as const;

export type SurvivabilityOperation =
  (typeof SURVIVABILITY_OPERATIONS)[keyof typeof SURVIVABILITY_OPERATIONS];

type NativeBridgeStage =
  | "HANDSHAKE_READ"
  | "AUTHORITY"
  | "HANDSHAKE_VERIFY"
  | "AUTHORIZATION"
  | "REQUEST_WRITE"
  | "RESPONSE_READ";

export interface EndpointManifest {
  formatVersion: typeof ENDPOINT_FORMAT_VERSION;
  state: "ready";
  host: "127.0.0.1";
  port: number;
  instanceId: string;
  processId: number;
  createdAtUnixMs: number;
}

export interface BridgeHandshake {
  formatVersion: typeof HANDSHAKE_FORMAT_VERSION;
  instanceId: string;
  port: number;
  workspaceId: string;
  installationId: string;
  challenge: string;
  mac: string;
}

interface BridgeRequest {
  formatVersion: typeof REQUEST_FORMAT_VERSION;
  requestId: string;
  instanceId: string;
  operation: string;
  authorization: string;
  backupId: string | null;
  recoveryCode: string | null;
}

interface BridgeResponse {
  formatVersion: typeof RESPONSE_FORMAT_VERSION;
  requestId: string;
  state: "complete" | "failed";
  result: unknown | null;
  error: { code: string; message: string } | null;
  completedAtUnixMs: number;
}

export interface NativeRequestOptions {
  backupId?: string;
  recoveryCode?: string;
}

export interface BackupSummary {
  backupId: string;
  createdAtUnixMs: number;
  verifiedAtUnixMs: number;
  retentionClass: string;
  pinned: boolean;
  workspaceId: string;
  sourceInstallationId: string;
  shopCount: number;
  plaintextBytes: number;
  containerBytes: number;
  status: string;
  location: string;
  requiresRecoveryKit: boolean;
  independentRecoveryReady: boolean;
}

export interface RecoveryKitResult {
  kitId: string;
  path: string;
  recoveryCode: string;
  workspaceId: string;
  brkId: string;
  createdAtUnixMs: number;
}

export interface RestorePreparationResult {
  backupId: string;
  restoreId: string;
  sourceWorkspaceId: string;
  sourceShopCount: number;
  restartRequired: boolean;
}

function dataDirectory(): string {
  const configured = process.env.SF_DATA_DIR;
  if (!configured || !isAbsolute(configured)) {
    throw new SahelFlowError(
      "Protected backup and recovery are available only in the desktop runtime",
      "SURVIVABILITY_NATIVE_RUNTIME_REQUIRED",
      503,
    );
  }
  return resolve(configured);
}

function endpointPath(): string {
  return join(dataDirectory(), "system", "survivability-endpoint.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return (
    actual.length === canonical.length &&
    actual.every((entry, index) => entry === canonical[index])
  );
}

function isHex(value: unknown, length: number): value is string {
  return (
    typeof value === "string" &&
    value.length === length &&
    /^[0-9a-f]+$/.test(value)
  );
}

function parseEndpoint(value: unknown): EndpointManifest {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "formatVersion",
      "state",
      "host",
      "port",
      "instanceId",
      "processId",
      "createdAtUnixMs",
    ]) ||
    value.formatVersion !== ENDPOINT_FORMAT_VERSION ||
    value.state !== "ready" ||
    value.host !== "127.0.0.1" ||
    typeof value.port !== "number" ||
    !Number.isSafeInteger(value.port) ||
    value.port < 1 ||
    value.port > 65_535 ||
    !isHex(value.instanceId, 32) ||
    typeof value.processId !== "number" ||
    !Number.isSafeInteger(value.processId) ||
    value.processId < 1 ||
    typeof value.createdAtUnixMs !== "number" ||
    !Number.isSafeInteger(value.createdAtUnixMs) ||
    value.createdAtUnixMs < 0
  ) {
    throw new SahelFlowError(
      "The protected desktop bridge manifest is invalid",
      "SURVIVABILITY_ENDPOINT_INVALID",
      503,
    );
  }
  return value as unknown as EndpointManifest;
}

function parseHandshake(value: unknown): BridgeHandshake {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "formatVersion",
      "instanceId",
      "port",
      "workspaceId",
      "installationId",
      "challenge",
      "mac",
    ]) ||
    value.formatVersion !== HANDSHAKE_FORMAT_VERSION ||
    !isHex(value.instanceId, 32) ||
    typeof value.port !== "number" ||
    !Number.isSafeInteger(value.port) ||
    value.port < 1 ||
    value.port > 65_535 ||
    !isHex(value.workspaceId, 32) ||
    !isHex(value.installationId, 32) ||
    !isHex(value.challenge, 64) ||
    !isHex(value.mac, 64)
  ) {
    throw new SahelFlowError(
      "The protected desktop bridge handshake is invalid",
      "SURVIVABILITY_HANDSHAKE_INVALID",
      503,
    );
  }
  return value as unknown as BridgeHandshake;
}

function parseResponse(value: unknown, requestId: string): BridgeResponse {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "formatVersion",
      "requestId",
      "state",
      "result",
      "error",
      "completedAtUnixMs",
    ]) ||
    value.formatVersion !== RESPONSE_FORMAT_VERSION ||
    value.requestId !== requestId ||
    (value.state !== "complete" && value.state !== "failed") ||
    typeof value.completedAtUnixMs !== "number" ||
    !Number.isSafeInteger(value.completedAtUnixMs) ||
    value.completedAtUnixMs < 0 ||
    (value.state === "complete" &&
      (value.error !== null || value.result === null)) ||
    (value.state === "failed" &&
      (value.result !== null || !isNativeError(value.error)))
  ) {
    throw new SahelFlowError(
      "The protected desktop completion receipt is invalid",
      "SURVIVABILITY_RESPONSE_INVALID",
      503,
    );
  }
  return value as unknown as BridgeResponse;
}

function isNativeError(
  value: unknown,
): value is { code: string; message: string } {
  return (
    isRecord(value) &&
    exactKeys(value, ["code", "message"]) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    value.code.length <= 96 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= 512
  );
}

function frame(domain: Buffer, fields: readonly Buffer[]): Buffer {
  const chunks: Buffer[] = [domain];
  for (const field of fields) {
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64LE(BigInt(field.length));
    chunks.push(length, field);
  }
  return Buffer.concat(chunks);
}

export function verifyBridgeHandshake(
  manifest: EndpointManifest,
  handshake: BridgeHandshake,
  installationRoot: Buffer,
  context: { workspaceId: string; installationId: string },
): void {
  if (
    handshake.instanceId !== manifest.instanceId ||
    handshake.port !== manifest.port ||
    handshake.workspaceId !== context.workspaceId.toLowerCase() ||
    handshake.installationId !== context.installationId.toLowerCase()
  ) {
    throw new SahelFlowError(
      "The protected desktop bridge belongs to another runtime authority",
      "SURVIVABILITY_HANDSHAKE_MISMATCH",
      503,
    );
  }

  const port = Buffer.allocUnsafe(2);
  port.writeUInt16LE(handshake.port);
  const derived = deriveInstallationKey(installationRoot, {
    workspaceId: context.workspaceId,
    installationId: context.installationId,
    purpose: "native-command-bridge",
    version: 1,
  });
  const supplied = Buffer.from(handshake.mac, "hex");
  const expected = createHmac("sha256", derived.key)
    .update(
      frame(HANDSHAKE_MAC_DOMAIN, [
        Buffer.from([HANDSHAKE_FORMAT_VERSION]),
        Buffer.from(handshake.instanceId, "utf8"),
        port,
        Buffer.from(handshake.workspaceId, "utf8"),
        Buffer.from(handshake.installationId, "utf8"),
        Buffer.from(handshake.challenge, "utf8"),
      ]),
    )
    .digest();
  try {
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new SahelFlowError(
        "The protected desktop bridge could not be authenticated",
        "SURVIVABILITY_HANDSHAKE_AUTH_FAILED",
        503,
      );
    }
  } finally {
    derived.key.fill(0);
    supplied.fill(0);
    expected.fill(0);
    port.fill(0);
  }
}

async function loadEndpoint(): Promise<EndpointManifest> {
  const path = endpointPath();
  const metadata = await lstat(path).catch(() => null);
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink()) {
    throw new SahelFlowError(
      "The protected desktop bridge is unavailable",
      "SURVIVABILITY_ENDPOINT_UNAVAILABLE",
      503,
    );
  }
  if (metadata.size < 1 || metadata.size > MAX_ENDPOINT_BYTES) {
    throw new SahelFlowError(
      "The protected desktop bridge manifest has invalid dimensions",
      "SURVIVABILITY_ENDPOINT_INVALID",
      503,
    );
  }
  const encoded = await readFile(path);
  try {
    return parseEndpoint(JSON.parse(encoded.toString("utf8")));
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "The protected desktop bridge manifest is unreadable",
      "SURVIVABILITY_ENDPOINT_INVALID",
      503,
    );
  } finally {
    encoded.fill(0);
  }
}

function waitForReadable(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off("readable", onReadable);
      socket.off("end", onEnd);
      socket.off("close", onClose);
      socket.off("error", onError);
    };
    const onReadable = () => {
      cleanup();
      resolve();
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("The protected desktop bridge closed its response"));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("The protected desktop bridge connection closed"));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("readable", onReadable);
    socket.once("end", onEnd);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
}

async function readExactly(socket: Socket, length: number): Promise<Buffer> {
  const output = Buffer.allocUnsafe(length);
  let offset = 0;
  try {
    while (offset < length) {
      const chunk = socket.read(length - offset) as Buffer | null;
      if (!chunk) {
        await waitForReadable(socket);
        continue;
      }
      chunk.copy(output, offset);
      offset += chunk.length;
    }
    return output;
  } catch (error) {
    output.fill(0);
    throw error;
  }
}

async function readFrame(socket: Socket, maximum: number): Promise<Buffer> {
  const prefix = await readExactly(socket, 4);
  const length = prefix.readUInt32BE(0);
  prefix.fill(0);
  if (length < 1 || length > maximum) {
    throw new SahelFlowError(
      "The protected desktop bridge returned an invalid frame",
      "SURVIVABILITY_FRAME_INVALID",
      503,
    );
  }
  return readExactly(socket, length);
}

async function writeSocketBuffer(socket: Socket, payload: Buffer): Promise<void> {
  await new Promise<void>((resolveWrite, reject) => {
    socket.write(payload, (error) => {
      if (error) reject(error);
      else resolveWrite();
    });
  });
}

async function writeFrame(socket: Socket, payload: Buffer): Promise<void> {
  if (payload.length < 1 || payload.length > MAX_REQUEST_BYTES) {
    throw new SahelFlowError(
      "The protected desktop request has invalid dimensions",
      "SURVIVABILITY_REQUEST_INVALID",
      500,
    );
  }
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(payload.length);
  try {
    await writeSocketBuffer(socket, prefix);
    await writeSocketBuffer(socket, payload);
  } finally {
    prefix.fill(0);
  }
}

function connect(endpoint: EndpointManifest): Promise<Socket> {
  return new Promise((resolveConnection, reject) => {
    const socket = createConnection({
      host: "127.0.0.1",
      port: endpoint.port,
      family: 4,
    });
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };
    const onConnect = () => {
      cleanup();
      socket.setNoDelay(true);
      socket.setTimeout(OPERATION_TIMEOUT_MS, () => {
        socket.destroy(new Error("The protected desktop operation timed out"));
      });
      resolveConnection(socket);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error("The protected desktop bridge connection timed out"));
    }, 5_000);
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

function canonicalResource(
  operation: SurvivabilityOperation,
  backupId?: string,
): string {
  if (
    operation === SURVIVABILITY_OPERATIONS.prepareRestore ||
    operation === SURVIVABILITY_OPERATIONS.deleteBackup
  ) {
    if (
      !backupId ||
      backupId.length < 16 ||
      backupId.length > 96 ||
      !/^[a-z0-9-]+$/.test(backupId)
    ) {
      throw new SahelFlowError("Invalid backup identity", "VALIDATION", 400);
    }
    return backupId;
  }
  return "workspace";
}

function nativeFailure(error: BridgeResponse["error"]): never {
  const code = error?.code || "SURVIVABILITY_NATIVE_FAILED";
  const message =
    error?.message ||
    "The protected backup or recovery operation could not be completed safely.";
  const status = code.includes("AUTHORIZATION")
    ? 403
    : code.includes("NOT-FOUND")
      ? 404
      : code.includes("BUSY") ||
          code.includes("RECOVERY-KIT") ||
          code.includes("VERIFICATION")
        ? 409
        : code.includes("SPACE")
          ? 507
          : 503;
  throw new SahelFlowError(message, code, status);
}

export async function invokeNativeSurvivability<T>(
  operation: SurvivabilityOperation,
  options: NativeRequestOptions = {},
): Promise<T> {
  const endpoint = await loadEndpoint();
  const socket = await connect(endpoint).catch(() => {
    throw new SahelFlowError(
      "The protected desktop bridge could not be reached",
      "SURVIVABILITY_ENDPOINT_UNAVAILABLE",
      503,
    );
  });
  const requestId = randomBytes(16).toString("hex");
  let stage: NativeBridgeStage = "HANDSHAKE_READ";
  let handshakeBytes: Buffer | null = null;
  let requestBytes: Buffer | null = null;
  let responseBytes: Buffer | null = null;
  try {
    handshakeBytes = await readFrame(socket, MAX_HANDSHAKE_BYTES);
    let handshake: BridgeHandshake;
    try {
      handshake = parseHandshake(JSON.parse(handshakeBytes.toString("utf8")));
    } catch (error) {
      if (error instanceof SahelFlowError) throw error;
      throw new SahelFlowError(
        "The protected desktop bridge handshake is unreadable",
        "SURVIVABILITY_HANDSHAKE_INVALID",
        503,
      );
    }

    stage = "AUTHORITY";
    const context = processShopContext();
    const installationRoot = getMasterKey();

    stage = "HANDSHAKE_VERIFY";
    verifyBridgeHandshake(endpoint, handshake, installationRoot, context);

    const resource = canonicalResource(operation, options.backupId);
    stage = "AUTHORIZATION";
    const authorization = createNativeCommandAuthorization({
      installationRoot,
      shopContext: context,
      action: operation.action as NativeSurvivabilityAction,
      resource,
    });
    const request: BridgeRequest = {
      formatVersion: REQUEST_FORMAT_VERSION,
      requestId,
      instanceId: endpoint.instanceId,
      operation: operation.operation,
      authorization,
      backupId: options.backupId ?? null,
      recoveryCode: options.recoveryCode?.trim() || null,
    };
    requestBytes = Buffer.from(JSON.stringify(request), "utf8");

    stage = "REQUEST_WRITE";
    await writeFrame(socket, requestBytes);

    stage = "RESPONSE_READ";
    responseBytes = await readFrame(socket, MAX_RESPONSE_BYTES);
    let response: BridgeResponse;
    try {
      response = parseResponse(
        JSON.parse(responseBytes.toString("utf8")),
        requestId,
      );
    } catch (error) {
      if (error instanceof SahelFlowError) throw error;
      throw new SahelFlowError(
        "The protected desktop completion receipt is unreadable",
        "SURVIVABILITY_RESPONSE_INVALID",
        503,
      );
    }
    if (response.state === "failed") nativeFailure(response.error);
    return response.result as T;
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "The protected desktop operation could not be completed safely",
      `SURVIVABILITY_${stage}_FAILED`,
      503,
    );
  } finally {
    handshakeBytes?.fill(0);
    requestBytes?.fill(0);
    responseBytes?.fill(0);
    socket.destroy();
  }
}
