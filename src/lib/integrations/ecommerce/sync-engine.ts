/**
 * E-commerce sync engine — fetches orders from a platform + creates internal
 * Order records (deduped by sourceOrderId).
 *
 * Workflow:
 *   1. Load credentials from the Secret store
 *   2. Load the watermark from the Integration.config (JSON: { watermark, lastSyncAt })
 *   3. Call the adapter's listOrdersSince
 *   4. For each normalized order:
 *      - Find-or-create the Customer (by phone)
 *      - Skip if an Order with the same sourceOrderId already exists (dedup)
 *      - Otherwise create the Order (draft status) + OrderItems
 *   5. Update the Integration.config with the new watermark + lastSyncAt
 *
 * The caller (API route) triggers a sync for one platform or all. The engine
 * is safe to call concurrently (dedup by sourceOrderId + unique constraint).
 */
import "server-only";


import { db } from "@/lib/db";
import { syntheticPhone } from "@/lib/shared/phone";
import { getEcommerceAdapter, loadEcommerceCredentials } from "./index";
import type { EcommercePlatform, NormalizedOrder } from "./types";
import type { Prisma } from "@prisma/client";

export interface SyncResult {
  platform: EcommercePlatform;
  fetched: number;
  created: number;
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

  // 4. Create internal Order records (deduped by sourceOrderId)
  for (const normalized of fetchResult.orders) {
    try {
      await createOrderFromSync(normalized);
      result.created++;
    } catch (err) {
      if (err instanceof AlreadySyncedError) {
        result.skipped++;
      } else {
        result.errors.push(
          `Order ${normalized.orderNumber}: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
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

/** Error thrown when an order was already synced (dedup). */
class AlreadySyncedError extends Error {
  constructor() {
    super("Already synced");
    this.name = "AlreadySyncedError";
  }
}

/**
 * Create an internal Order from a normalized platform order.
 * Dedup: if an Order with the same sourceOrderId (in sourceMetadata) exists, skip.
 */
async function createOrderFromSync(normalized: NormalizedOrder): Promise<void> {
  // Dedup check: look for an order with this sourceOrderId in sourceMetadata.
  // Since sourceMetadata is a JSON string, we search by contains (the sourceOrderId
  // is a unique enough substring). This is a pragmatic approach for SQLite.
  const sourceOrderId = normalized.sourceOrderId;
  const existing = await db.order.findFirst({
    where: {
      source: normalized.source,
      sourceMetadata: { contains: sourceOrderId },
    },
    select: { id: true },
  });
  if (existing) {
    throw new AlreadySyncedError();
  }

  // Find-or-create the customer by phone (blind index lookup via the extension).
  // If the source order has no customer phone, generate a deterministic synthetic
  // phone keyed on (source, sourceOrderId) so re-syncs find the same record
  // instead of colliding on a shared fake phone. See `syntheticPhone` docs.
  const customerPhone =
    normalized.customerPhone || syntheticPhone(normalized.source, sourceOrderId);
  let customer = await db.customer.findUnique({
    where: { phone: customerPhone },
  });
  if (!customer) {
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

  // Generate an internal order number
  const existingCount = await db.order.count();
  const orderNumber = `SYNC-${normalized.source.toUpperCase()}-${String(existingCount + 1).padStart(4, "0")}`;

  // Calculate total
  const itemsTotal = normalized.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const totalPrice = normalized.totalPrice || itemsTotal;

  // Create the order + items in a transaction
  const orderData: Prisma.OrderCreateInput = {
    orderNumber,
    status: "draft",
    customer: { connect: { id: customer.id } },
    totalPrice,
    wilaya: normalized.wilaya ?? "Inconnu",
    commune: normalized.commune ?? "Inconnu",
    address: normalized.address,
    // Use the resolved plaintext phone (real or synthetic) — the Prisma
    // extension will HMAC it into the order's `phone` blind index and AES
    // it into `phoneEnc`. (Do NOT use `customer.phone` here — that's already
    // a blind index, would produce a double-HMAC.)
    phone: customerPhone,
    source: normalized.source,
    sourceMetadata: JSON.stringify(normalized.sourceMetadata),
    notes: null,
    items: {
      create: normalized.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.unitPrice * item.quantity,
      })),
    },
  };

  await db.order.create({ data: orderData });
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
