import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { assessOrderRisk } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { orderStatusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/orders — list orders (optional ?status= filter) */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const rawStatus = searchParams.get("status");
  const status = rawStatus && orderStatusSchema.safeParse(rawStatus).success ? rawStatus : undefined;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const orders = await orderService.list({ prisma: db }, {
    status: (status as "draft" | "pending" | "confirmed" | "shipped" | "delivered" | "returned" | "refused" | "cancelled") ?? undefined,
    limit: Math.min(limit, 100),
    offset,
  });

  return NextResponse.json({ orders });
}

/** POST /api/orders — create a new order + auto-assess risk (withErrorHandler pattern) */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const order = await orderService.create({ prisma: db }, body);

  // Auto-assess risk on creation (fire-and-forget — don't block the response
  // if the risk engine has an issue; the assessment is also available via
  // GET /api/risk/assess/[orderId] on demand).
  let risk: Awaited<ReturnType<typeof assessOrderRisk>> = null;
  try {
    risk = await assessOrderRisk(order.id);
  } catch {
    // Risk assessment is non-critical — the order was created successfully.
  }

  return NextResponse.json({ order, risk }, { status: 201 });
}, "POST /api/orders");
