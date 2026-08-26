import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

import type { ServiceContext } from "@/lib/data/service-base";
import { whatsAppMediaRoot } from "./media-object-store";

const TEMP_FILE_PATTERN = /^\.[0-9a-f]{64}\.[0-9]+\.[0-9a-f]{12}\.tmp$/;
const MAX_TEMP_REMOVALS_PER_SWEEP = 128;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const lastSweepByRoot = new Map<string, number>();

function syncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Reconcile only the media store's exact crash-temporary filename contract.
 * The single WhatsApp worker invokes this before starting any media download,
 * so matching files in the active scope cannot belong to a concurrent worker
 * write. A bounded batch prevents a pathological directory from monopolizing
 * the provider-effect tick; remaining candidates are handled on the next tick.
 */
export function reconcileAbandonedWhatsAppMediaTemps(
  context: ServiceContext,
  now = Date.now(),
): number {
  const root = whatsAppMediaRoot(context);
  const lastSweep = lastSweepByRoot.get(root);
  if (lastSweep !== undefined && now - lastSweep < SWEEP_INTERVAL_MS) return 0;
  if (!existsSync(root)) {
    lastSweepByRoot.set(root, now);
    return 0;
  }

  const rootStats = lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("WhatsApp media scope is not a safe directory");
  }

  const candidates = readdirSync(root)
    .filter((name) => TEMP_FILE_PATTERN.test(name))
    .sort();
  let removed = 0;
  for (const name of candidates.slice(0, MAX_TEMP_REMOVALS_PER_SWEEP)) {
    const path = join(root, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("WhatsApp media temporary object is not a safe regular file");
    }
    unlinkSync(path);
    removed += 1;
  }
  if (removed > 0) syncDirectory(root);

  // If the bounded batch left work, deliberately do not advance the interval;
  // the next non-overlapping worker tick continues reconciliation immediately.
  if (candidates.length <= MAX_TEMP_REMOVALS_PER_SWEEP) {
    lastSweepByRoot.set(root, now);
  }
  return removed;
}
