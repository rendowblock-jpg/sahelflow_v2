import "server-only";

import { createHash } from "node:crypto";

import {
  dispatchTrigger,
  type TriggerEvent,
} from "@/lib/automations/engine";
import {
  sourceBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  commerceOrderIsCancelled,
  commerceSourceSnapshot,
  prepareCanonicalCommerceOrder,
} from "@/lib/orders/canonical-commerce-order";
import { executeCanonicalOrderRecovery } from "@/lib/orders/canonical-order-recovery";
import { commitCanonicalSourceCheckpoint } from "@/lib/orders/canonical-source-checkpoint";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import {
  readCanonicalSourceOrderAuthority,
  type CanonicalOrderSource,
} from "@/lib/orders/manual-order-authority";
import { syntheticPhone } from "@/lib/shared/phone";
import { getEcommerceAdapter, loadEcommerceCredentials } from "./index";
import type { EcommercePlatform, NormalizedOrder } from "./types";

export interface SyncResult {
  platform: EcommercePlatform;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  watermark: string;
  hasMore: boolean;
}

interface IntegrationConfig {
  watermark: string;
  lastSyncAt: string;
}

type UpsertOutcome = "created" | "updated" | "skipped";

function parseConfig(value: string | null): IntegrationConfig {
  if (!value) return { watermark: "", lastSyncAt: "" };
  try {
    const parsed = JSON.parse(value) as Partial<IntegrationConfig>;
    return {
      watermark: typeof parsed.watermark === "string" ? parsed.watermark : "",
      lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : "",
    };
  } catch {
    return { watermark: "", lastSyncAt: "" };
  }
}

function stableKey(scope: string, ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  return `commerce:${scope}:${digest}`;
}

function snapshotEquals(
  stored: Record<string, unknown> | undefined,
  current: Record<string, unknown>,
): boolean {
  return JSON.stringify(stored ?? {}) === JSON.stringify(current);
}

function safeReason(platform: EcommercePlatform): string {
  return `provider-${platform}-cancelled`;
}

async function ensureIntegration(
  context: ServiceContext,
  platform: EcommercePlatform,
) {
  return context.prisma.integration.upsert({
    where: { platform },
    create: {
      platform,
      type: "E-commerce",
      isActive: true,
      config: JSON.stringify({ watermark: "", lastSyncAt: "" }),
    },
    update: {
      type: "E-commerce",
      isActive: true,
    },
  });
}

async function cancelCanonicalProviderOrder(
  context: BusinessPrincipalContext,
  order: {
    id: string;
    orderNumber: string;
    status: string;
    version: number;
    fulfillmentState: string | null;
    deliveryState: string | null;
    inventoryState: string | null;
    codState: string | null;
  },
  platform: EcommercePlatform,
  sourceRevision: string,
): Promise<number> {
  const reasonCode = safeReason(platform);
  if (order.status === "cancelled") return order.version;

  if (order.status === "pending") {
    const decision = await executeManualOrderDecision(context, {
      orderId: order.id,
      decision: "reject",
      expectedVersion: order.version,
      idempotencyKey: stableKey(
        "cancel-pending",
        platform,
        order.id,
        sourceRevision,
      ),
      correlationId: `commerce:${platform}:${order.id}:${sourceRevision}`,
      reason: reasonCode,
    });
    if (!decision.replayed) {
      const trigger = decision.result.automation.trigger as TriggerEvent;
      await dispatchTrigger(
        context,
        trigger,
        decision.result.automation.order,
        {
          triggerKey: `${trigger}:${order.id}:v${decision.result.version}`,
        },
      );
    }
    return decision.result.version;
  }

  if (
    order.status === "confirmed" &&
    ["unfulfilled", "ready"].includes(order.fulfillmentState ?? "") &&
    order.deliveryState === "not_created" &&
    order.inventoryState === "reserved" &&
    order.codState === "not_expected"
  ) {
    const recovery = await executeCanonicalOrderRecovery(context, {
      orderId: order.id,
      action: "cancel",
      expectedVersion: order.version,
      idempotencyKey: stableKey(
        "cancel-confirmed",
        platform,
        order.id,
        sourceRevision,
      ),
      correlationId: `commerce:${platform}:${order.id}:${sourceRevision}`,
      reasonCode,
      occurredAt: new Date().toISOString(),
    });
    return recovery.result.version;
  }

  throw new Error(
    `Provider cancellation cannot safely transition order ${order.orderNumber} from '${order.status}'`,
  );
}

async function upsertCanonicalCommerceOrder(
  context: ServiceContext,
  platform: EcommercePlatform,
  sourceIdentity: string,
  normalized: NormalizedOrder,
): Promise<UpsertOutcome> {
  if (normalized.source !== platform) {
    throw new Error(
      `Adapter source '${normalized.source}' does not match sync platform '${platform}'`,
    );
  }

  const db = context.prisma;
  const snapshot = commerceSourceSnapshot(normalized);
  const principalContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: sourceBusinessPrincipal(
      platform as CanonicalOrderSource,
      sourceIdentity,
    ),
  };
  const existing = await db.order.findFirst({
    where: {
      source: platform,
      sourceOrderId: normalized.sourceOrderId,
      deletedAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      source: true,
      sourceOrderId: true,
      sourceMetadata: true,
      status: true,
      version: true,
      fulfillmentState: true,
      deliveryState: true,
      inventoryState: true,
      codState: true,
    },
  });

  if (!existing) {
    const prepared = await prepareCanonicalCommerceOrder(context, normalized);
    const phone =
      normalized.customerPhone ||
      syntheticPhone(normalized.source, normalized.sourceOrderId);
    const command = await createCanonicalSourceOrder(principalContext, {
      idempotencyKey: stableKey(
        "create",
        platform,
        sourceIdentity,
        normalized.sourceOrderId,
      ),
      correlationId: `commerce:${platform}:${normalized.sourceOrderId}`,
      source: platform,
      sourceIdentity,
      sourceOrderId: normalized.sourceOrderId,
      sourceRevision: prepared.sourceRevision,
      sourceDetails: prepared.sourceDetails,
      newCustomer: {
        name: normalized.customerName || "Client",
        phone,
        wilaya: normalized.wilaya || "Inconnu",
        commune: normalized.commune || "Inconnu",
        address: normalized.address || "Adresse non renseignée",
      },
      items: prepared.items,
      wilaya: normalized.wilaya || "Inconnu",
      commune: normalized.commune || "Inconnu",
      address: normalized.address || "Adresse non renseignée",
      phone,
      deliveryCost: prepared.deliveryCost,
      notes: `Imported from ${platform} order ${normalized.orderNumber}`,
    });
    if (!command.replayed) {
      await dispatchTrigger(
        context,
        "order.created" as TriggerEvent,
        command.result.automation,
        {
          triggerKey: `order.created:${command.result.order.id}`,
          occurredAt: command.result.order.createdAt,
        },
      );
    }
    if (commerceOrderIsCancelled(normalized)) {
      await cancelCanonicalProviderOrder(
        principalContext,
        {
          id: command.result.order.id,
          orderNumber: command.result.order.orderNumber,
          status: command.result.order.status,
          version: command.result.order.version,
          fulfillmentState: command.result.order.fulfillmentState,
          deliveryState: command.result.order.deliveryState,
          inventoryState: command.result.order.inventoryState,
          codState: command.result.order.codState,
        },
        platform,
        prepared.sourceRevision,
      );
    }
    return command.replayed ? "skipped" : "created";
  }

  const authority = readCanonicalSourceOrderAuthority(
    existing.source,
    existing.sourceMetadata,
  );
  if (
    !authority ||
    authority.source !== platform ||
    authority.sourceIdentity !== sourceIdentity ||
    authority.sourceOrderId !== normalized.sourceOrderId
  ) {
    throw new Error(
      `Existing ${platform} order ${normalized.orderNumber} requires governed legacy adoption`,
    );
  }
  if (
    authority.sourceRevision === snapshot.sourceRevision &&
    snapshotEquals(authority.sourceDetails, snapshot.sourceDetails)
  ) {
    return "skipped";
  }

  let expectedVersion = existing.version;
  if (commerceOrderIsCancelled(normalized)) {
    expectedVersion = await cancelCanonicalProviderOrder(
      principalContext,
      existing,
      platform,
      snapshot.sourceRevision,
    );
  }
  await commitCanonicalSourceCheckpoint(principalContext, {
    orderId: existing.id,
    expectedVersion,
    source: platform,
    sourceIdentity,
    sourceOrderId: normalized.sourceOrderId,
    sourceRevision: snapshot.sourceRevision,
    sourceDetails: snapshot.sourceDetails,
    idempotencyKey: stableKey(
      "checkpoint",
      platform,
      existing.id,
      snapshot.sourceRevision,
    ),
    correlationId: `commerce:${platform}:${existing.id}:${snapshot.sourceRevision}`,
  });
  return "updated";
}

export async function syncPlatform(
  context: ServiceContext,
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

  const credentials = await loadEcommerceCredentials(context, platform);
  if (!credentials) {
    result.errors.push(`No credentials configured for ${platform}`);
    return result;
  }
  const integration = await ensureIntegration(context, platform);
  const config = parseConfig(integration.config);
  result.watermark = config.watermark;
  const sourceIdentity = `integration:${integration.id}`;

  const adapter = getEcommerceAdapter(platform);
  let fetchResult;
  try {
    fetchResult = await adapter.listOrdersSince(
      credentials,
      config.watermark,
      maxPages,
    );
  } catch (error) {
    result.errors.push(
      `Fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return result;
  }

  result.fetched = fetchResult.orders.length;
  result.hasMore = fetchResult.hasMore;
  for (const normalized of fetchResult.orders) {
    try {
      const outcome = await upsertCanonicalCommerceOrder(
        context,
        platform,
        sourceIdentity,
        normalized,
      );
      if (outcome === "created") result.created += 1;
      else if (outcome === "updated") result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.errors.push(
        `Order ${normalized.orderNumber}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  if (result.errors.length > 0) {
    result.watermark = config.watermark;
    return result;
  }

  const syncedAt = new Date();
  const newConfig: IntegrationConfig = {
    watermark: fetchResult.nextWatermark,
    lastSyncAt: syncedAt.toISOString(),
  };
  await context.prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastSyncAt: syncedAt,
      config: JSON.stringify(newConfig),
    },
  });
  result.watermark = fetchResult.nextWatermark;
  return result;
}

export async function syncAllPlatforms(
  context: ServiceContext,
  maxPages = 10,
): Promise<SyncResult[]> {
  const platforms: EcommercePlatform[] = ["shopify", "woocommerce", "youcan"];
  const results: SyncResult[] = [];
  for (const platform of platforms) {
    if (!(await loadEcommerceCredentials(context, platform))) continue;
    results.push(await syncPlatform(context, platform, maxPages));
  }
  return results;
}
