import { env } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { syncPlatform, syncAllPlatforms } from "@/lib/integrations/ecommerce/sync-engine";
import type { EcommercePlatform } from "@/lib/integrations/ecommerce/types";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
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
export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  // Session 30 (AUDIT-2 A11): accept EITHER auth OR x-cron-secret.
  // Previously required BOTH, but no client code ever sent x-cron-secret
  // → connected stores never synced. Now the "Sync now" button in the
  // Settings UI works with just the auth cookie. Cron jobs still use
  // x-cron-secret (no cookie).
  const headerSecret = req.headers.get("x-cron-secret");
  const envSecret = env.cronSecret;
  const cronOk = !!headerSecret && !!envSecret && constantTimeEqual(headerSecret, envSecret);
  if (!cronOk) {
    // Fall back to cookie auth
    try {
      await requireAuth();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
}, "POST /api/integrations/sync");

/**
 * GET /api/integrations/sync — returns the last sync status for each platform.
 */
export async function GET(): Promise<NextResponse> {
  await requireAuth();
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
