import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { normalizeBridgeUrl, pingBridge } from "@/lib/integrations/google-sheets/bridge-client";
import {
  ensureBridgeKey,
  loadBridgeConfig,
  saveBridgeConfig,
  saveBridgeUrl,
} from "@/lib/integrations/google-sheets/bridge-config";
import { autoMapSheetHeaders } from "@/lib/integrations/google-sheets/bridge-sync";
import { bridgeState } from "@/lib/integrations/google-sheets/bridge-state";

export const dynamic = "force-dynamic";

const connectSchema = z.object({ url: z.string().trim().min(1).max(500) });

/**
 * POST /api/integrations/google-sheets/bridge/connect — verify the pasted web
 * app URL against this installation's key, then remember it. Nothing is
 * imported yet: the seller reviews the mapping and preview first.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const input = connectSchema.parse(await request.json().catch(() => ({})));
  const url = normalizeBridgeUrl(input.url);
  const context = { prisma: db, shop: shopContext };
  const key = await ensureBridgeKey(context);
  const ping = await pingBridge({ url, key });
  const config = await loadBridgeConfig(context);
  const sameSheet =
    config.spreadsheetId === ping.spreadsheetId && config.sheet === ping.sheet;
  await saveBridgeUrl(context, url);
  await saveBridgeConfig(context, {
    ...config,
    spreadsheetId: ping.spreadsheetId,
    spreadsheetName: ping.spreadsheetName,
    sheet: ping.sheet,
    sheets: ping.sheets,
    headers: ping.headers,
    mapping: sameSheet && Object.keys(config.mapping).length > 0
      ? config.mapping
      : autoMapSheetHeaders(ping.headers),
    cursorRow: sameSheet ? config.cursorRow : 2,
    lastFullScanAt: sameSheet ? config.lastFullScanAt : null,
  });
  return NextResponse.json({ ...(await bridgeState()), rowCount: ping.rowCount });
}, "POST /api/integrations/google-sheets/bridge/connect");
