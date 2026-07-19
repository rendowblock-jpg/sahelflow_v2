import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { isGoogleSheetsConfigured } from "@/lib/integrations/google-sheets";
import { db, shopContext } from "@/lib/db";

export const GET = withErrorHandler(async () => {
  await requireAuth();
  const configured = await isGoogleSheetsConfigured({ prisma: db, shop: shopContext });
  return NextResponse.json({ configured });
}, "GET /api/integrations/google-sheets/status");
