import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { runSheetSync } from "@/lib/integrations/google-sheets/bridge-sync";
import { bridgeState } from "@/lib/integrations/google-sheets/bridge-state";

export const dynamic = "force-dynamic";

const syncSchema = z.object({ full: z.boolean().optional() });

/** POST /api/integrations/google-sheets/bridge/sync — import new rows and write statuses now. */
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth([
    "integrations.manage",
    "data.import",
    "orders.create",
    "customers.contact.read",
    "customers.contact.update",
  ]);
  const input = syncSchema.parse(await request.json().catch(() => ({})));
  const result = await runSheetSync({ prisma: db, shop: shopContext }, { full: input.full });
  return NextResponse.json({ result, ...(await bridgeState()) });
}, "POST /api/integrations/google-sheets/bridge/sync");
