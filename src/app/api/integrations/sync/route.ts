import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import {
  queueCommerceSync,
  queueConfiguredCommerceSyncs,
} from "@/lib/integrations/ecommerce/queue";
import type { EcommercePlatform } from "@/lib/integrations/ecommerce/types";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const syncSchema = z.object({
  platform: z
    .enum(["shopify", "woocommerce", "youcan"])
    .optional()
    .describe("Sync a single platform. Omit to sync all configured platforms."),
  maxPages: z.number().int().min(1).max(50).optional().default(10),
});

/**
 * POST /api/integrations/sync
 *
 * Triggers an e-commerce order sync (polling-based). Fetches new orders from
 * the configured platform(s) and creates internal Order records.
 *
 * Body:
 *   { platform?: "shopify"|"woocommerce"|"youcan", maxPages?: number }
 *
 * If platform is omitted, syncs all platforms that have credentials configured.
 *
 * Auth: requires x-cron-secret header (same as /api/reports/daily) OR can be
 * called from the Settings UI (future). For now, cron-secret only.
 */
export const POST = withErrorHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    await requireAuth([
      "integrations.manage",
      "data.import",
      "orders.create",
      "customers.contact.read",
      "customers.contact.update",
      "orders.financials.read",
      "orders.financials.update",
    ]);

    const body = await req.json().catch(() => ({}));
    const input = syncSchema.parse(body);
    const context = { prisma: db, shop: shopContext };

    if (input.platform) {
      const run = await queueCommerceSync(
        context,
        input.platform as EcommercePlatform,
        input.maxPages,
      );
      return NextResponse.json({ runs: [run] }, { status: 202 });
    }

    const runs = await queueConfiguredCommerceSyncs(context, input.maxPages);
    if (runs.length === 0) {
      return NextResponse.json({
        runs: [],
        message:
          "No e-commerce platforms configured. Add credentials in Settings.",
      });
    }
    return NextResponse.json({ runs }, { status: 202 });
  },
  "POST /api/integrations/sync",
);

/**
 * GET /api/integrations/sync — returns the last sync status for each platform.
 */
export async function GET(): Promise<NextResponse> {
  await requireAuth("integrations.read");
  const integrations = await db.integration.findMany({
    where: {
      platform: { in: ["shopify", "woocommerce", "youcan"] },
    },
    select: { platform: true, isActive: true, lastSyncAt: true, config: true },
  });

  const statuses = integrations.map((i) => {
    let watermark = "";
    if (i.config) {
      try {
        const parsed = JSON.parse(i.config) as { watermark?: string };
        watermark = parsed.watermark ?? "";
      } catch {
        // corrupt config
      }
    }
    return {
      platform: i.platform,
      isActive: i.isActive,
      lastSyncAt: i.lastSyncAt,
      watermark,
    };
  });

  const runs = await db.commerceSyncRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      platform: true,
      status: true,
      pagesFetched: true,
      fetchedCount: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      failedCount: true,
      lastErrorCode: true,
      nextAttemptAt: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ statuses, runs });
}
