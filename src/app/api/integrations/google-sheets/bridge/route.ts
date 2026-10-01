import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { pingBridge } from "@/lib/integrations/google-sheets/bridge-client";
import {
  forgetBridge,
  loadBridgeConfig,
  loadBridgeTarget,
  saveBridgeConfig,
  SHEET_FIELD_KEYS,
  STATUS_LANGUAGES,
  type SheetsBridgeConfig,
} from "@/lib/integrations/google-sheets/bridge-config";
import { autoMapSheetHeaders, foldText } from "@/lib/integrations/google-sheets/bridge-sync";
import { bridgeState } from "@/lib/integrations/google-sheets/bridge-state";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** GET /api/integrations/google-sheets/bridge — connection state and settings. */
export const GET = withErrorHandler(async () => {
  await requireAuth("integrations.read");
  return NextResponse.json(await bridgeState(), {
    headers: { "Cache-Control": "no-store, private" },
  });
}, "GET /api/integrations/google-sheets/bridge");

const updateSchema = z.object({
  sheet: z.string().trim().min(1).max(200).optional(),
  mapping: z.record(z.string().max(300), z.enum(SHEET_FIELD_KEYS)).optional(),
  productAliases: z.record(z.string().max(300), z.string().max(300)).optional(),
  autoImport: z.boolean().optional(),
  intervalMinutes: z.union([z.literal(2), z.literal(5), z.literal(15), z.literal(30)]).optional(),
  writeBack: z.boolean().optional(),
  statusLanguage: z.enum(STATUS_LANGUAGES).optional(),
});

/** PUT — change the tab, the column mapping, product matches or sync options. */
export const PUT = withErrorHandler(async (request: NextRequest) => {
  await requireAuth("integrations.manage");
  const input = updateSchema.parse(await request.json().catch(() => ({})));
  const context = { prisma: db, shop: shopContext };
  const config = await loadBridgeConfig(context);
  let next: SheetsBridgeConfig = { ...config };

  if (input.sheet && input.sheet !== config.sheet) {
    const target = await loadBridgeTarget(context);
    if (!target) {
      throw new SahelFlowError("Google Sheets is not connected", "SHEETS_BRIDGE_NOT_CONNECTED", 409);
    }
    const ping = await pingBridge(target, { sheet: input.sheet });
    next = {
      ...next,
      sheet: ping.sheet,
      sheets: ping.sheets,
      headers: ping.headers,
      mapping: autoMapSheetHeaders(ping.headers),
      cursorRow: 2,
      lastFullScanAt: null,
    };
  }
  if (input.mapping) {
    const allowed = new Set(next.headers);
    const fields = Object.values(input.mapping);
    if (Object.keys(input.mapping).some((header) => !allowed.has(header))) {
      throw new SahelFlowError("Mapping names a column that is not in the sheet", "SHEETS_MAPPING_INVALID", 400);
    }
    if (new Set(fields).size !== fields.length) {
      throw new SahelFlowError("Each SahelFlow field can be used once", "SHEETS_MAPPING_INVALID", 400);
    }
    next = { ...next, mapping: input.mapping, lastFullScanAt: null };
  }
  if (input.productAliases) {
    next = {
      ...next,
      productAliases: Object.fromEntries(
        Object.entries(input.productAliases)
          .filter(([, product]) => product.trim())
          .map(([text, product]) => [foldText(text), product.trim()]),
      ),
      lastFullScanAt: null,
    };
  }
  if (input.autoImport !== undefined) next.autoImport = input.autoImport;
  if (input.intervalMinutes !== undefined) next.intervalMinutes = input.intervalMinutes;
  if (input.writeBack !== undefined) next.writeBack = input.writeBack;
  if (input.statusLanguage !== undefined && input.statusLanguage !== next.statusLanguage) {
    next.statusLanguage = input.statusLanguage;
  }
  await saveBridgeConfig(context, next);
  return NextResponse.json(await bridgeState());
}, "PUT /api/integrations/google-sheets/bridge");

/** DELETE — disconnect. Imported orders stay; the sheet keeps its SahelFlow columns. */
export const DELETE = withErrorHandler(async () => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  await forgetBridge({ prisma: db, shop: shopContext });
  return NextResponse.json(await bridgeState());
}, "DELETE /api/integrations/google-sheets/bridge");
