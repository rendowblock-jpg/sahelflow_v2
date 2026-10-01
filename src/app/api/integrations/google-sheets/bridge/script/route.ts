import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { ensureBridgeKey } from "@/lib/integrations/google-sheets/bridge-config";
import { renderBridgeScript } from "@/lib/integrations/google-sheets/bridge-script";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/google-sheets/bridge/script — the Apps Script for
 * this installation. It embeds the bridge key, so it is owner-grade: the
 * caller must hold integrations.manage and have entered their PIN recently.
 */
export const POST = withErrorHandler(async () => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const key = await ensureBridgeKey({ prisma: db, shop: shopContext });
  return NextResponse.json(
    { script: renderBridgeScript(key) },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}, "POST /api/integrations/google-sheets/bridge/script");
