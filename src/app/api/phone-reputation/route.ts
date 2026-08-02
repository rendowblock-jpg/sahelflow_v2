import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { reportBadPhone, getBadPhoneList } from "@/lib/data/phone-reputation";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_req: NextRequest) => {
  await requireAuth("risk.read");
  const list = await getBadPhoneList({ prisma: db, shop: shopContext });
  return NextResponse.json({ list });
}, "GET /api/phone-reputation");

const reportSchema = z.object({
  phone: z.string().min(1),
  reason: z.string().min(1),
  orderId: z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("risk.manage");
  const body = await req.json();
  const parsed = reportSchema.parse(body);
  const result = await reportBadPhone(
    { prisma: db, shop: shopContext },
    parsed.phone,
    parsed.reason,
    parsed.orderId,
  );
  return NextResponse.json(result, { status: 201 });
}, "POST /api/phone-reputation");
