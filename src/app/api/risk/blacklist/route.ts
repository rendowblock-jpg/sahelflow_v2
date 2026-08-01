import { NextRequest, NextResponse } from "next/server";
import { listBlacklistedCustomers, blacklistCustomer } from "@/lib/risk-engine";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/risk/blacklist — list blacklisted customers */
export async function GET() {
  await requireAuth("risk.read");
  const customers = await listBlacklistedCustomers({ prisma: db, shop: shopContext });
  return NextResponse.json({ customers });
}

/** POST /api/risk/blacklist — add a customer to the blacklist */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("risk.manage");
  const { customerId, reason } = z.object({ customerId: z.string().min(1), reason: z.string().max(500).optional() }).parse(await req.json());
  await blacklistCustomer({ prisma: db, shop: shopContext }, customerId, reason);
  return NextResponse.json({ ok: true }, { status: 201 });
}, "POST /api/risk/blacklist");
