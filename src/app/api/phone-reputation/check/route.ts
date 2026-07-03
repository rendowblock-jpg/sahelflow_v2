import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { checkPhoneReputation } from "@/lib/data/phone-reputation";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  const result = await checkPhoneReputation(phone);
  return NextResponse.json(result);
}, "GET /api/phone-reputation/check");
