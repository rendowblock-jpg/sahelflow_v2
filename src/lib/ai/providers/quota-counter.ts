/**
 * Provider REQUEST counter, kept in the settings table (key/value, no
 * migration): ai_requests_<provider>_<yyyy-mm-dd UTC>. One chat question can
 * use several provider requests, so counting messages says nothing about a
 * daily quota. Best effort: a failed read or write never breaks an AI call.
 */
import { deleteSetting, getSetting, setSetting } from "@/lib/settings";
import type { ServiceContext } from "@/lib/data/service-base";
import { AI_PROVIDER_IDS, type AiProviderId } from "./quota-ledger";
import {
  REQUEST_COUNT_PREFIX,
  clearPendingRequestCounts,
  pendingRequestCount,
  putBackPendingRequestCount,
  requestCountKey,
  takePendingRequestCounts,
} from "./quota-pending";

export { noteProviderRequest, requestCountKey } from "./quota-pending";

/** Counters older than this many days are deleted when a count is written. */
export const PRUNE_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

let queue: Promise<void> = Promise.resolve();

/** For tests: forget counts not yet written. */
export function resetPendingRequestCountsForTests(): void {
  clearPendingRequestCounts();
  queue = Promise.resolve();
}

function storedCount(value: string | null): number | undefined {
  if (value === null) return 0;
  return /^\d+$/.test(value.trim()) ? Number.parseInt(value, 10) : undefined;
}

async function pruneOldCounters(context: ServiceContext, now: Date): Promise<void> {
  try {
    const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const rows = await context.prisma.setting.findMany({
      where: { key: { startsWith: REQUEST_COUNT_PREFIX } },
      select: { key: true },
    });
    for (const row of rows) {
      const day = /_(\d{4}-\d{2}-\d{2})$/.exec(row.key)?.[1];
      const dayMs = Date.parse(`${day ?? ""}T00:00:00.000Z`);
      if (!Number.isFinite(dayMs) || (today - dayMs) / DAY_MS <= PRUNE_AFTER_DAYS) continue;
      await deleteSetting(context, row.key);
    }
  } catch {
    // old counters stay for now; they are harmless
  }
}

async function writeCounts(context: ServiceContext, now: Date): Promise<void> {
  const batch = takePendingRequestCounts();
  if (batch.size === 0) return;
  for (const [key, count] of batch) {
    try {
      const current = storedCount(await getSetting(context, key)) ?? 0;
      await setSetting(context, key, String(current + count));
    } catch {
      // keep the count for the next write rather than lose it
      putBackPendingRequestCount(key, count);
    }
  }
  await pruneOldCounters(context, now);
}

/** Writes the counts noted since the last write. Never throws; writes run one after another. */
export function flushRequestCounts(context: ServiceContext, now: Date = new Date()): Promise<void> {
  const run = queue.then(() => writeCounts(context, now));
  queue = run.catch(() => undefined);
  return run.catch(() => undefined);
}

/** Requests made today (UTC day). A provider whose count cannot be read is left out: unknown, not zero. */
export async function readRequestsToday(
  context: ServiceContext,
  now: Date = new Date(),
): Promise<Partial<Record<AiProviderId, number>>> {
  const out: Partial<Record<AiProviderId, number>> = {};
  for (const provider of AI_PROVIDER_IDS) {
    const key = requestCountKey(provider, now);
    try {
      const stored = storedCount(await getSetting(context, key));
      if (stored !== undefined) out[provider] = stored + pendingRequestCount(key);
    } catch {
      // unreadable: leave this provider out
    }
  }
  return out;
}
