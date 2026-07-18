import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { checkPhoneReputation } from "@/lib/data/phone-reputation";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  const result = await checkPhoneReputation({ prisma: db, shop: shopContext }, phone);
  return NextResponse.json(result);
}, "GET /api/phone-reputation/check");
