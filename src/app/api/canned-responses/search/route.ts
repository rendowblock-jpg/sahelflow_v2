import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { searchCannedResponses } from "@/lib/data/canned-response-service";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const responses = await searchCannedResponses({ prisma: db, shop: shopContext }, q);
  return NextResponse.json({ responses });
}, "GET /api/canned-responses/search");
