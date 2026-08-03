import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { getMasterKey } from "@/lib/crypto/master-key";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";
import type { NativeShopLifecycleCommand } from "./native-lifecycle-command";

const COMMAND_KEY_DOMAIN = Buffer.from(
  "sahelflow.shop-lifecycle.command.key.v1",
  "utf8",
);
const SESSION_BINDING_DOMAIN = Buffer.from(
  "sahelflow.shop-lifecycle.session-binding.v1\0",
  "utf8",
);
const INBOX_DIRECTORY = "shop-lifecycle-inbox";
const PENDING_DIRECTORY = "pending";
const MAX_COMMAND_BYTES = 128 * 1024;

function inboxError(
  message: string,
  code = "SHOP_LIFECYCLE_INBOX_UNAVAILABLE",
  statusCode = 503,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function commandKey(): Buffer {
  const root = getMasterKey();
  if (root.length !== 32) {
    throw inboxError("Installation root key is not 256-bit");
  }
  return createHmac("sha256", root).update(COMMAND_KEY_DOMAIN).digest();
}

export function nativeShopLifecycleSessionBinding(sessionId: string): string {
  if (
    !sessionId ||
    sessionId !== sessionId.trim() ||
    Buffer.byteLength(sessionId, "utf8") > 256
  ) {
    throw inboxError(
      "Authenticated session cannot be bound to native shop lifecycle",
      "SHOP_LIFECYCLE_SESSION_INVALID",
      401,
    );
  }
  const key = commandKey();
  try {
    return createHmac("sha256", key)
      .update(SESSION_BINDING_DOMAIN)
      .update(sessionId, "utf8")
      .digest("hex");
  } finally {
    key.fill(0);
  }
}

function pendingDirectory(): string {
  const root = dataRoot();
  if (!isAbsolute(root)) {
    throw inboxError("Shop lifecycle data root is not absolute");
  }
  const pending = resolve(root, INBOX_DIRECTORY, PENDING_DIRECTORY);
  mkdirSync(pending, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(pending);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw inboxError("Shop lifecycle inbox is redirected");
  }
  const canonicalRoot = realpathSync(root);
  const canonicalPending = realpathSync(pending);
  const pathFromRoot = relative(canonicalRoot, canonicalPending);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw inboxError("Shop lifecycle inbox escaped the canonical data root");
  }
  return canonicalPending;
}

export function enqueueNativeShopLifecycleCommand(
  command: NativeShopLifecycleCommand,
): Readonly<{ operationId: string }> {
  const operationId = command.authorization.request.operationId;
  if (!/^[0-9a-f]{32}$/.test(operationId)) {
    throw inboxError(
      "Native shop lifecycle operation identity is invalid",
      "SHOP_LIFECYCLE_OPERATION_INVALID",
      400,
    );
  }

  const serialized = Buffer.from(`${JSON.stringify(command)}\n`, "utf8");
  if (serialized.length === 0 || serialized.length > MAX_COMMAND_BYTES) {
    throw inboxError(
      "Native shop lifecycle command exceeds the bounded inbox size",
      "SHOP_LIFECYCLE_COMMAND_TOO_LARGE",
      413,
    );
  }

  const pending = pendingDirectory();
  const target = join(pending, `${operationId}.json`);
  if (existsSync(target)) {
    throw inboxError(
      "Native shop lifecycle operation already exists",
      "SHOP_LIFECYCLE_OPERATION_EXISTS",
      409,
    );
  }
  const temporary = join(
    pending,
    `.${operationId}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, serialized);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, target);
    try {
      const directory = openSync(dirname(target), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } catch {
      // Directory fsync is unavailable on some Windows filesystems. The file
      // itself was flushed before the same-directory atomic rename.
    }
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(temporary, { force: true });
    throw error;
  }

  return Object.freeze({ operationId });
}
