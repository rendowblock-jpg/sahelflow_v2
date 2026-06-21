import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { syncPlatform, syncAllPlatforms } from "@/lib/integrations/ecommerce/sync-engine";
import type { EcommercePlatform } from "@/lib/integrations/ecommerce/types";

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
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret
  const headerSecret = req.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  if (!headerSecret || !envSecret || headerSecret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const input = syncSchema.parse(body);

    if (input.platform) {
      const result = await syncPlatform(input.platform as EcommercePlatform, input.maxPages);
      return NextResponse.json({ results: [result] });
    }

    const results = await syncAllPlatforms(input.maxPages);
    if (results.length === 0) {
      return NextResponse.json({
        results: [],
        message: "No e-commerce platforms configured. Add credentials in Settings.",
      });
    }
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[POST /api/integrations/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/integrations/sync — returns the last sync status for each platform.
 */
export async function GET(): Promise<NextResponse> {
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

  return NextResponse.json({ statuses });
}
