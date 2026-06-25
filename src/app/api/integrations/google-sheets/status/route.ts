import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { isGoogleSheetsConfigured } from "@/lib/integrations/google-sheets";

export const GET = withErrorHandler(async () => {
  await requireAuth();
  const configured = await isGoogleSheetsConfigured();
  return NextResponse.json({ configured });
}, "GET /api/integrations/google-sheets/status");
