import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname } from "node:path";

export interface WhatsAppMediaEraseStage {
  activePath: string;
  tombstonePath: string;
  fresh: boolean;
  hadActiveTree: boolean;
}

function tombstonePath(activePath: string): string {
  return `${activePath}.erasing`;
}

function assertSafeExistingPath(path: string): void {
  if (!existsSync(path)) return;
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    throw new Error("WhatsApp media erase authority must not follow symbolic links");
  }
  if (!stats.isDirectory()) {
    throw new Error("WhatsApp media erase authority expected a directory");
  }
}

function syncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function syncParent(path: string): void {
  const parent = dirname(path);
  if (existsSync(parent)) syncDirectory(parent);
}

export function whatsAppMediaErasePending(activePath: string): boolean {
  const tombstone = tombstonePath(activePath);
  assertSafeExistingPath(tombstone);
  return existsSync(tombstone);
}

/**
 * Hide the exact shop media tree before destructive DB work. A deterministic
 * sibling tombstone is also created for an empty tree so concurrent media
 * writers fail closed instead of recreating live state during the erase.
 */
export function stageWhatsAppMediaErase(activePath: string): WhatsAppMediaEraseStage {
  const tombstone = tombstonePath(activePath);
  const parent = dirname(activePath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertSafeExistingPath(activePath);
  assertSafeExistingPath(tombstone);

  if (existsSync(tombstone)) {
    if (existsSync(activePath)) {
      throw new Error("WhatsApp media erase state is ambiguous");
    }
    return {
      activePath,
      tombstonePath: tombstone,
      fresh: false,
      hadActiveTree: true,
    };
  }

  const hadActiveTree = existsSync(activePath);
  if (hadActiveTree) {
    renameSync(activePath, tombstone);
  } else {
    mkdirSync(tombstone, { mode: 0o700 });
  }
  syncParent(tombstone);
  return {
    activePath,
    tombstonePath: tombstone,
    fresh: true,
    hadActiveTree,
  };
}

/** Restore only a tombstone created by the current request when DB erase fails. */
export function rollbackWhatsAppMediaErase(stage: WhatsAppMediaEraseStage): void {
  if (!stage.fresh || !existsSync(stage.tombstonePath)) return;
  assertSafeExistingPath(stage.tombstonePath);
  if (existsSync(stage.activePath)) {
    throw new Error("Cannot roll back WhatsApp media erase over a live tree");
  }
  if (stage.hadActiveTree) {
    renameSync(stage.tombstonePath, stage.activePath);
  } else {
    rmSync(stage.tombstonePath, { recursive: true, force: true });
  }
  syncParent(stage.activePath);
}

/**
 * Final deletion happens only after DB erase commits. Failure leaves ciphertext
 * hidden in the tombstone, so retry cannot re-expose erased customer data.
 */
export function commitWhatsAppMediaErase(stage: WhatsAppMediaEraseStage): void {
  if (!existsSync(stage.tombstonePath)) return;
  assertSafeExistingPath(stage.tombstonePath);
  rmSync(stage.tombstonePath, { recursive: true, force: true });
  syncParent(stage.tombstonePath);
}
