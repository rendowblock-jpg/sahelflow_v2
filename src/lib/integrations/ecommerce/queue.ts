import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import { loadEcommerceCredentials } from "./index";
import {
  commerceActiveKey,
  commerceHash,
  parseCommerceIntegrationConfig,
} from "./runtime-contracts";
import type { EcommercePlatform } from "./types";

export interface QueuedCommerceSync {
  id: string;
  platform: EcommercePlatform;
  status: string;
  replayed: boolean;
  initialWatermark: string;
}

function requireExactShop(context: ServiceContext): void {
  if (context.shop) return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") return;
  throw new SahelFlowError(
    "Commerce sync requires an exact trusted ShopContext",
    "COMMERCE_SYNC_SHOP_AUTHORITY_REQUIRED",
    500,
  );
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
    update: { type: "E-commerce", isActive: true },
  });
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function queueCommerceSync(
  context: ServiceContext,
  platform: EcommercePlatform,
  pagesPerCycle = 10,
): Promise<QueuedCommerceSync> {
  requireExactShop(context);
  if (!Number.isInteger(pagesPerCycle) || pagesPerCycle < 1 || pagesPerCycle > 50) {
    throw new SahelFlowError(
      "Commerce sync page budget must be between 1 and 50",
      "COMMERCE_SYNC_PAGE_BUDGET_INVALID",
      400,
    );
  }
  if (!(await loadEcommerceCredentials(context, platform))) {
    throw new SahelFlowError(
      `No credentials configured for ${platform}`,
      "COMMERCE_SYNC_CREDENTIALS_MISSING",
      409,
    );
  }

  const activeKey = commerceActiveKey(platform);
  const existing = await context.prisma.commerceSyncRun.findUnique({
    where: { activeKey },
  });
  if (existing) {
    return {
      id: existing.id,
      platform,
      status: existing.status,
      replayed: true,
      initialWatermark: existing.initialWatermark,
    };
  }

  const integration = await ensureIntegration(context, platform);
  const initialWatermark = parseCommerceIntegrationConfig(
    integration.config,
  ).watermark;
  const id = randomUUID();
  const runKey = `commerce-sync:${commerceHash([
    context.shop?.workspaceId ?? "test",
    context.shop?.installationId ?? process.env.DATABASE_URL ?? "test",
    context.shop?.shopIncarnationId ?? "test",
    platform,
    initialWatermark,
    id,
  ])}`;

  try {
    const run = await context.prisma.commerceSyncRun.create({
      data: {
        id,
        runKey,
        activeKey,
        platform,
        integrationId: integration.id,
        sourceIdentity: `integration:${integration.id}`,
        status: "queued",
        initialWatermark,
        candidateWatermark: initialWatermark,
        pagesPerCycle,
        nextAttemptAt: new Date(),
      },
    });
    return {
      id: run.id,
      platform,
      status: run.status,
      replayed: false,
      initialWatermark,
    };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const concurrent = await context.prisma.commerceSyncRun.findUnique({
      where: { activeKey },
    });
    if (!concurrent) throw error;
    return {
      id: concurrent.id,
      platform,
      status: concurrent.status,
      replayed: true,
      initialWatermark: concurrent.initialWatermark,
    };
  }
}

export async function queueConfiguredCommerceSyncs(
  context: ServiceContext,
  pagesPerCycle = 10,
): Promise<QueuedCommerceSync[]> {
  const platforms: EcommercePlatform[] = ["shopify", "woocommerce", "youcan"];
  const queued: QueuedCommerceSync[] = [];
  for (const platform of platforms) {
    if (!(await loadEcommerceCredentials(context, platform))) continue;
    queued.push(await queueCommerceSync(context, platform, pagesPerCycle));
  }
  return queued;
}
