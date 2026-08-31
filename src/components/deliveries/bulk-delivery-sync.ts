/**
 * Client-side bulk tracking sync for the deliveries surface (R3-d, d4 fix #7).
 *
 * The per-delivery POST /api/delivery/sync route is intentionally untouched
 * (PR #355 ownership); batching happens entirely in the client. NO auto-
 * polling of courier APIs: every sync call spends provider quota and can hit
 * rate limits, so syncs are always seller-triggered (per-row button or this
 * manual bulk run).
 */

/** Delivery statuses that are still moving in the field and worth re-syncing. */
export const SYNCABLE_DELIVERY_STATUSES = [
  "pending",
  "created",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
] as const satisfies readonly string[];

/**
 * List-API status groups covering every syncable status. `pending` maps to
 * pending+created on the server (PENDING_STATUSES); the others are exact.
 */
const SYNC_BATCH_STATUS_PARAMS = [
  "pending",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
] as const;

/** Hard cap on one bulk run — protects provider rate limits and patience. */
export const BULK_SYNC_CAP = 100;

/** Concurrent sync calls (Promise.allSettled batches of this size). */
export const SYNC_CONCURRENCY = 4;

/** pageSize the list API accepts at most (delivery-workbench MAX_PAGE_SIZE). */
const LIST_PAGE_SIZE = 100;

export interface BulkSyncDeliveryCandidate {
  id: string;
  status: string;
  trackingNumber: string | null;
  createdAt: Date | string;
}

export interface BulkSyncDeliveryList {
  deliveries: BulkSyncDeliveryCandidate[];
}

export function isSyncableDelivery(
  delivery: BulkSyncDeliveryCandidate,
): boolean {
  return (
    SYNCABLE_DELIVERY_STATUSES.includes(
      delivery.status as (typeof SYNCABLE_DELIVERY_STATUSES)[number],
    ) && Boolean(delivery.trackingNumber)
  );
}

export interface SyncBatch {
  /** Rows to sync, most recent first. */
  batch: BulkSyncDeliveryCandidate[];
  /** True when syncable rows existed beyond the cap. */
  capped: boolean;
  /** Total syncable rows found before capping. */
  syncableTotal: number;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Dedupe (status groups cannot overlap, but be defensive), keep only rows the
 * sync route accepts (active status + tracking number), order most-recent
 * first, then cap at `cap`.
 */
export function collectSyncBatch(
  rows: readonly BulkSyncDeliveryCandidate[],
  cap: number = BULK_SYNC_CAP,
): SyncBatch {
  const seen = new Set<string>();
  const syncable: BulkSyncDeliveryCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (isSyncableDelivery(row)) syncable.push(row);
  }
  syncable.sort((left, right) => toTime(right.createdAt) - toTime(left.createdAt));
  const batch = syncable.slice(0, Math.max(0, cap));
  return {
    batch,
    capped: syncable.length > batch.length,
    syncableTotal: syncable.length,
  };
}

/**
 * Fetch every syncable delivery through the permission-governed list API
 * (read-only; no API changes). One request per status group, in parallel.
 */
export async function collectInTransitDeliveries(
  fetchJson: (url: string) => Promise<BulkSyncDeliveryList>,
): Promise<BulkSyncDeliveryCandidate[]> {
  const lists = await Promise.all(
    SYNC_BATCH_STATUS_PARAMS.map((status) =>
      fetchJson(
        `/api/delivery?page=1&pageSize=${LIST_PAGE_SIZE}&status=${status}`,
      ),
    ),
  );
  return lists.flatMap((list) => list?.deliveries ?? []);
}

export interface BulkSyncOutcome {
  succeeded: number;
  failed: number;
  /** Failures where the route persisted provider data but the order needs reconciliation (HTTP 409). */
  reconciliationRequired: number;
  /** Tracking numbers (fallback: ids) of failed rows, first few. */
  failedRefs: string[];
}

export interface SyncCallResult {
  ok: boolean;
  reconciliationRequired?: boolean;
}

async function defaultSyncDelivery(deliveryId: string): Promise<SyncCallResult> {
  const response = await fetch("/api/delivery/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deliveryId }),
  });
  if (response.ok) return { ok: true };
  const data = (await response.json().catch(() => null)) as
    | { reconciliationRequired?: boolean }
    | null;
  return { ok: false, reconciliationRequired: Boolean(data?.reconciliationRequired) };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Run the bulk sync: Promise.allSettled over batches of `concurrency` rows so
 * provider calls never exceed ~4 in flight. Progress is reported after each
 * settled batch.
 */
export async function runBulkDeliverySync(
  deliveries: readonly BulkSyncDeliveryCandidate[],
  options: {
    concurrency?: number;
    sync?: (deliveryId: string) => Promise<SyncCallResult>;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<BulkSyncOutcome> {
  const concurrency = options.concurrency ?? SYNC_CONCURRENCY;
  const sync = options.sync ?? defaultSyncDelivery;
  const total = deliveries.length;
  const outcome: BulkSyncOutcome = {
    succeeded: 0,
    failed: 0,
    reconciliationRequired: 0,
    failedRefs: [],
  };
  let done = 0;

  for (const group of chunk(deliveries, Math.max(1, concurrency))) {
    const settled = await Promise.allSettled(
      group.map((delivery) => sync(delivery.id)),
    );
    for (const [index, result] of settled.entries()) {
      const delivery = group[index];
      if (result.status === "fulfilled" && result.value.ok) {
        outcome.succeeded += 1;
        continue;
      }
      outcome.failed += 1;
      if (
        result.status === "fulfilled" &&
        result.value.reconciliationRequired
      ) {
        outcome.reconciliationRequired += 1;
      }
      if (delivery && outcome.failedRefs.length < 5) {
        outcome.failedRefs.push(
          delivery.trackingNumber ?? delivery.id,
        );
      }
    }
    done += group.length;
    options.onProgress?.(Math.min(done, total), total);
  }

  return outcome;
}
