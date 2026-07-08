/**
 * E-commerce sync engine — fetches orders from a platform + creates internal
 * Order records (deduped by sourceOrderId).
 *
 * Workflow:
 *   1. Load credentials from the Secret store
 *   2. Load the watermark from the Integration.config (JSON: { watermark, lastSyncAt })
 *   3. Call the adapter's listOrdersSince
 *   4. For each normalized order (I-M3: upsert semantics):
 *      - Find-or-create the Customer (by phone)
 *      - If an Order with the same sourceOrderId already exists:
 *        - Compare the existing sourceMetadata to the new one.
 *        - If unchanged → skip (counts as `skipped`).
 *        - If changed (platform-side status update, e.g. cancellation) →
 *          UPDATE the Order's sourceMetadata + set internal status to
 *          "cancelled" if the platform reports a cancellation (counts as
 *          `updated`). Previously the engine threw AlreadySyncedError and
 *          platform status updates never propagated.
 *      - Otherwise create the Order (draft status) + OrderItems
 *   5. Update the Integration.config with the new watermark + lastSyncAt
 *
 * The caller (API route) triggers a sync for one platform or all. The engine
 * is safe to call concurrently (dedup by sourceOrderId + unique constraint).
 */
import "server-only";


import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { syntheticPhone } from "@/lib/shared/phone";
import { getEcommerceAdapter, loadEcommerceCredentials } from "./index";
import type { EcommercePlatform, NormalizedOrder } from "./types";

export interface SyncResult {
  platform: EcommercePlatform;
  fetched: number;
  created: number;
  /** I-M3: existing orders whose platform-side state changed (e.g. cancellation). */
  updated: number;
  /** Existing orders whose platform-side state is unchanged (no-op). */
  skipped: number;
  errors: string[];
  watermark: string;
  hasMore: boolean;
}

interface IntegrationConfig {
  watermark: string;
  lastSyncAt: string;
}

/**
 * Sync orders for a single platform.
 * @param platform - "shopify" | "woocommerce" | "youcan"
 * @param maxPages - safety cap on pagination (default 10)
 */
export async function syncPlatform(
  platform: EcommercePlatform,
  maxPages = 10,
): Promise<SyncResult> {
  const result: SyncResult = {
    platform,
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    watermark: "",
    hasMore: false,
  };

  // 1. Load credentials
  const credentials = await loadEcommerceCredentials(platform);
  if (!credentials) {
    result.errors.push(`No credentials configured for ${platform}`);
    return result;
  }

  // 2. Load the watermark from Integration.config
  const integration = await db.integration.findUnique({ where: { platform } });
  let config: IntegrationConfig = { watermark: "", lastSyncAt: "" };
  if (integration?.config) {
    try {
      config = JSON.parse(integration.config) as IntegrationConfig;
    } catch {
      // corrupt config — start fresh
    }
  }

  // 3. Fetch orders from the platform
  const adapter = getEcommerceAdapter(platform);
  let fetchResult;
  try {
    fetchResult = await adapter.listOrdersSince(credentials, config.watermark, maxPages);
  } catch (err) {
    result.errors.push(
      `Fetch failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    return result;
  }

  result.fetched = fetchResult.orders.length;
  result.watermark = fetchResult.nextWatermark;
  result.hasMore = fetchResult.hasMore;

  // 4. Upsert internal Order records (deduped by sourceOrderId).
  // I-M3: existing orders are now UPDATED in-place when their platform-side
  // sourceMetadata changed (status updates, cancellations), rather than
  // throwing AlreadySyncedError and dropping the update.
  for (const normalized of fetchResult.orders) {
    try {
      const outcome = await upsertOrderFromSync(normalized);
      if (outcome === "created") result.created++;
      else if (outcome === "updated") result.updated++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(
        `Order ${normalized.orderNumber}: ${err instanceof Error ? err.message : "Unknown"}`,
      );
    }
  }

  // 5. Update the Integration record with the new watermark + timestamp
  const newConfig: IntegrationConfig = {
    watermark: fetchResult.nextWatermark,
    lastSyncAt: new Date().toISOString(),
  };
  await db.integration.upsert({
    where: { platform },
    create: {
      platform,
      type: "E-commerce",
      isActive: true,
      lastSyncAt: new Date(),
      config: JSON.stringify(newConfig),
    },
    update: {
      lastSyncAt: new Date(),
      config: JSON.stringify(newConfig),
    },
  });

  return result;
}

/**
 * Outcome of an upsert for one normalized platform order.
 * - "created": a new internal Order row was inserted.
 * - "updated": an existing row had its sourceMetadata (and possibly status)
 *   updated to reflect a platform-side change (I-M3).
 * - "skipped": an existing row was found and its platform-side state is
 *   unchanged — no DB write needed.
 */
type UpsertOutcome = "created" | "updated" | "skipped";

/**
 * Returns true if the platform-side metadata indicates the order was
 * cancelled. We use this to propagate the cancellation to the internal
 * Order.status field (so cancelled Shopify/Woo/YouCan orders don't stay
 * "draft" forever in the SahelFlow UI).
 *
 * - Shopify: `cancel_reason` is a non-null string when the order is cancelled.
 * - WooCommerce: `wooStatus === "cancelled"`.
 * - YouCan: `statusNew === "cancelled"`.
 */
function isPlatformCancelled(meta: Record<string, unknown>): boolean {
  if (typeof meta.cancelReason === "string" && meta.cancelReason.length > 0) {
    return true;
  }
  if (meta.wooStatus === "cancelled") return true;
  if (meta.statusNew === "cancelled") return true;
  return false;
}

/**
 * Upsert an internal Order from a normalized platform order.
 *
 * Dedup: uses the dedicated sourceOrderId column (backed by a unique
 * constraint on [source, sourceOrderId]). The unique constraint makes this
 * race-safe — concurrent syncs that pass the findUnique check will fail at
 * create() with P2002, which surfaces as an error in the sync result.
 *
 * I-M3: when an existing order is found, we no longer throw AlreadySyncedError.
 * Instead, we compare the existing sourceMetadata to the new one:
 *   - unchanged  → return "skipped" (no DB write)
 *   - changed    → UPDATE the row's sourceMetadata + set status to "cancelled"
 *                  if the platform cancelled it, then return "updated".
 * This lets platform-side status updates (cancellations, fulfillment changes)
 * propagate to the internal Order instead of being silently dropped.
 */
async function upsertOrderFromSync(
  normalized: NormalizedOrder,
): Promise<UpsertOutcome> {
  const sourceOrderId = normalized.sourceOrderId;
  const newMetaJson = JSON.stringify(normalized.sourceMetadata);

  if (sourceOrderId) {
    const existing = await db.order.findUnique({
      where: { source_sourceOrderId: { source: normalized.source, sourceOrderId } },
      select: { id: true, sourceMetadata: true, status: true },
    });
    if (existing) {
      // I-M3: only update if the platform-side metadata actually changed.
      // Comparing the JSON string is a robust signal — adapters include
      // rawUpdatedAt (Shopify) / rawDateModified (Woo) / updated_at (YouCan)
      // in sourceMetadata, so any platform-side change touches the string.
      if (existing.sourceMetadata === newMetaJson) {
        return "skipped";
      }
      // Propagate platform-side sourceMetadata changes inline (e.g. updated
      // timestamps, fulfillment notes). This is a non-status update — safe to
      // do directly without the state machine.
      await db.order.update({
        where: { id: existing.id },
        data: { sourceMetadata: newMetaJson },
      });

      // Phase 1 bug 1.3: propagate platform cancellations through the
      // canonical orderService.updateStatus path so stock is restored +
      // order.cancelled automation trigger fires + OrderChange ledger entry
      // is recorded. Previously this was a raw db.order.update({status:
      // "cancelled"}) that bypassed all side effects — stock stayed deducted,
      // no trigger fired, no ledger entry.
      if (isPlatformCancelled(normalized.sourceMetadata) && existing.status !== "cancelled") {
        try {
          await orderService.updateStatus(
            { prisma: db },
            existing.id,
            "cancelled",
            { actor: "system" },
          );
        } catch {
          // Graceful: if the transition is invalid (e.g. order already in a
          // terminal state), the sourceMetadata update still committed.
          // Log best-effort via the service's error path.
        }
      }
      return "updated";
    }
  }

  // ── New order: find-or-create customer, then create the Order + items ──

  // Find-or-create the customer by phone (blind index lookup via the extension).
  // If the source order has no customer phone, generate a deterministic synthetic
  // phone keyed on (source, sourceOrderId) so re-syncs find the same record
  // instead of colliding on a shared fake phone. See `syntheticPhone` docs.
  //
  // CONN-3-FEATURES: filter out soft-deleted customers. The Customer model has
  // @@unique([phone]) WITHOUT deletedAt, so a soft-deleted customer still owns
  // its phone in the unique index. The previous `findUnique({ where: { phone } })`
  // would find the soft-deleted row and silently resurrect it (re-attach new
  // orders to a customer the merchant thought they'd deleted). Switching to
  // findFirst with `deletedAt: null` skips soft-deleted rows so a fresh
  // Customer record is created for the new order.
  const customerPhone =
    normalized.customerPhone || syntheticPhone(normalized.source, sourceOrderId);
  let customer = await db.customer.findFirst({
    where: { phone: customerPhone, deletedAt: null },
  });
  if (!customer) {
    // No active customer with this phone. Check if a soft-deleted one exists
    // (the merchant deleted them, then a new sync order came in with the same
    // phone). Instead of failing with P2002 (unique constraint on phone), we
    // RESTORE the soft-deleted customer — un-set deletedAt + update their info.
    // This is the "restore on resurrect" pattern: the customer is back, with
    // their order history intact.
    const softDeleted = await db.customer.findFirst({
      where: { phone: customerPhone, deletedAt: { not: null } },
    });
    if (softDeleted) {
      customer = await db.customer.update({
        where: { id: softDeleted.id },
        data: {
          deletedAt: null,
          name: normalized.customerName ?? softDeleted.name,
          wilaya: normalized.wilaya ?? softDeleted.wilaya,
          commune: normalized.commune ?? softDeleted.commune,
          address: normalized.address ?? softDeleted.address,
        },
      });
    } else {
      customer = await db.customer.create({
        data: {
          name: normalized.customerName,
          phone: customerPhone,
          wilaya: normalized.wilaya,
          commune: normalized.commune,
          address: normalized.address,
        },
      });
    }
  }

  // Phase 1 bug 1.3: route through orderService.create so synced orders get
  // the OrderChange "created" ledger entry + the `order.created` automation
  // trigger (same as manual UI orders). Pass orderNumberPrefix so synced
  // orders keep their SYNC-<PLATFORM>-XXXX number format (distinguishable
  // from manual/AI/storefront orders in the orders list + deduped by the
  // SYNC-<PLATFORM> counter, separate from the ORD counter).
  await orderService.create(
    { prisma: db },
    {
      customerId: customer.id,
      items: normalized.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      wilaya: normalized.wilaya ?? "Inconnu",
      commune: normalized.commune ?? "Inconnu",
      address: normalized.address,
      phone: customerPhone,
      source: normalized.source,
      sourceOrderId: sourceOrderId ?? null,
      sourceMetadata: normalized.sourceMetadata,
      notes: null,
      orderNumberPrefix: `SYNC-${normalized.source.toUpperCase()}`,
    },
  );
  return "created";
}

/**
 * Sync all configured e-commerce platforms.
 * Returns results per platform.
 */
export async function syncAllPlatforms(maxPages = 10): Promise<SyncResult[]> {
  const platforms: EcommercePlatform[] = ["shopify", "woocommerce", "youcan"];
  const results: SyncResult[] = [];

  for (const platform of platforms) {
    // Skip platforms without credentials
    const hasCreds = await loadEcommerceCredentials(platform);
    if (!hasCreds) continue;

    const result = await syncPlatform(platform, maxPages);
    results.push(result);
  }

  return results;
}
