import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname } from "node:path";

const ERASE_STATE_KEY = Symbol.for("sahelflow.whatsapp.media-erase.v1");
const ERASE_EPOCH_KEY = Symbol.for("sahelflow.whatsapp.media-erase-epoch.v1");

type MediaEraseGlobal = typeof globalThis & {
  [ERASE_STATE_KEY]?: Set<string>;
  [ERASE_EPOCH_KEY]?: Map<string, number>;
};

export interface WhatsAppMediaEraseStage {
  activePath: string;
  tombstonePath: string;
  fresh: boolean;
  hadActiveTree: boolean;
}

export type WhatsAppMediaEraseReconciliation =
  | "none"
  | "in-progress"
  | "committed"
  | "rolled-back"
  | "rolled-back-empty";

function activeErases(): Set<string> {
  const eraseGlobal = globalThis as MediaEraseGlobal;
  eraseGlobal[ERASE_STATE_KEY] ??= new Set<string>();
  return eraseGlobal[ERASE_STATE_KEY];
}

function eraseEpochs(): Map<string, number> {
  const eraseGlobal = globalThis as MediaEraseGlobal;
  eraseGlobal[ERASE_EPOCH_KEY] ??= new Map<string, number>();
  return eraseGlobal[ERASE_EPOCH_KEY];
}

/**
 * Monotonic same-process generation for seller reads. A read that spans any
 * destructive erase attempt is rejected even if that attempt commits (and
 * removes its tombstone) or rolls back before the read's async continuation
 * resumes.
 */
export function whatsAppMediaEraseEpoch(activePath: string): number {
  return eraseEpochs().get(activePath) ?? 0;
}

function advanceEraseEpoch(activePath: string): void {
  const epochs = eraseEpochs();
  const current = epochs.get(activePath) ?? 0;
  const next = current >= Number.MAX_SAFE_INTEGER ? 1 : current + 1;
  epochs.set(activePath, next);
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
 *
 * Only one same-process owner may stage a scope. A crash-left tombstone has no
 * process owner after restart and remains eligible for deterministic recovery.
 */
export function stageWhatsAppMediaErase(activePath: string): WhatsAppMediaEraseStage {
  if (activeErases().has(activePath)) {
    throw new Error("WhatsApp media erase is already active for this shop");
  }

  const tombstone = tombstonePath(activePath);
  const parent = dirname(activePath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertSafeExistingPath(activePath);
  assertSafeExistingPath(tombstone);

  // Advance before any filesystem authority changes. From this point onward an
  // already-started seller read belongs to an older generation and must fail
  // closed, regardless of whether this erase later commits or rolls back.
  advanceEraseEpoch(activePath);

  if (existsSync(tombstone)) {
    if (existsSync(activePath)) {
      throw new Error("WhatsApp media erase state is ambiguous");
    }
    activeErases().add(activePath);
    return {
      activePath,
      tombstonePath: tombstone,
      fresh: false,
      hadActiveTree: readdirSync(tombstone).length > 0,
    };
  }

  const hadActiveTree = existsSync(activePath);
  if (hadActiveTree) {
    renameSync(activePath, tombstone);
  } else {
    mkdirSync(tombstone, { mode: 0o700 });
  }
  syncParent(tombstone);
  activeErases().add(activePath);
  return {
    activePath,
    tombstonePath: tombstone,
    fresh: true,
    hadActiveTree,
  };
}

/** Restore only a tombstone created by the current request when DB erase fails. */
export function rollbackWhatsAppMediaErase(stage: WhatsAppMediaEraseStage): void {
  try {
    if (!stage.fresh || !existsSync(stage.tombstonePath)) return;
    assertSafeExistingPath(stage.tombstonePath);

    // An empty-tree stage creates only a blocking marker. If a writer that had
    // already passed its first preflight creates the active directory before the
    // DB transaction fails, removing the marker is still the correct rollback:
    // canonical DB truth remains intact, so the writer may safely continue.
    if (!stage.hadActiveTree) {
      rmSync(stage.tombstonePath, { recursive: true, force: true });
      syncParent(stage.activePath);
      return;
    }

    if (existsSync(stage.activePath)) {
      throw new Error("Cannot roll back WhatsApp media erase over a live tree");
    }
    renameSync(stage.tombstonePath, stage.activePath);
    syncParent(stage.activePath);
  } finally {
    activeErases().delete(stage.activePath);
  }
}

/**
 * Final deletion happens only after DB erase commits. Failure leaves ciphertext
 * hidden in the tombstone, so restart reconciliation can finish deletion without
 * re-exposing data whose canonical rows were already erased.
 */
export function commitWhatsAppMediaErase(stage: WhatsAppMediaEraseStage): void {
  try {
    if (!existsSync(stage.tombstonePath)) return;
    assertSafeExistingPath(stage.tombstonePath);
    rmSync(stage.tombstonePath, { recursive: true, force: true });
    syncParent(stage.tombstonePath);
  } finally {
    activeErases().delete(stage.activePath);
  }
}

/**
 * Reconcile only crash-left erase state. The process-local active set prevents
 * the periodic worker from interfering with an erase still executing in this
 * process. After restart that set is empty, so canonical Message truth decides:
 * zero rows means an erase committed and hidden ciphertext must stay deleted;
 * retained rows mean the DB transaction did not commit and the prior media tree
 * must be restored. An empty tombstone is only a blocking marker and is removed.
 */
export function reconcileWhatsAppMediaEraseAfterRestart(
  activePath: string,
  canonicalMessageCount: number,
): WhatsAppMediaEraseReconciliation {
  if (!Number.isSafeInteger(canonicalMessageCount) || canonicalMessageCount < 0) {
    throw new Error("Canonical WhatsApp message count is invalid");
  }
  if (activeErases().has(activePath)) return "in-progress";

  const tombstone = tombstonePath(activePath);
  assertSafeExistingPath(activePath);
  assertSafeExistingPath(tombstone);
  if (!existsSync(tombstone)) return "none";
  if (existsSync(activePath)) {
    throw new Error("WhatsApp media erase restart state is ambiguous");
  }

  const hiddenEntries = readdirSync(tombstone).length;
  if (canonicalMessageCount === 0) {
    rmSync(tombstone, { recursive: true, force: true });
    syncParent(tombstone);
    return "committed";
  }
  if (hiddenEntries === 0) {
    rmSync(tombstone, { recursive: true, force: true });
    syncParent(tombstone);
    return "rolled-back-empty";
  }

  renameSync(tombstone, activePath);
  syncParent(activePath);
  return "rolled-back";
}
