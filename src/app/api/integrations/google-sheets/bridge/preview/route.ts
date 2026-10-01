import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { SHEET_FIELD_KEYS } from "@/lib/integrations/google-sheets/bridge-config";
import { previewSheetImport } from "@/lib/integrations/google-sheets/bridge-sync";

export const dynamic = "force-dynamic";

const previewSchema = z.object({
  sheet: z.string().trim().min(1).max(200).optional(),
  mapping: z.record(z.string().max(300), z.enum(SHEET_FIELD_KEYS)).optional(),
  productAliases: z.record(z.string().max(300), z.string().max(300)).optional(),
});

/**
 * POST /api/integrations/google-sheets/bridge/preview — read the first rows
 * and show exactly what an import would create, row by row, without creating
 * anything.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth(["integrations.manage", "data.import"]);
  const input = previewSchema.parse(await request.json().catch(() => ({})));
  const preview = await previewSheetImport({ prisma: db, shop: shopContext }, input);
  return NextResponse.json(preview, { headers: { "Cache-Control": "no-store, private" } });
}, "POST /api/integrations/google-sheets/bridge/preview");
