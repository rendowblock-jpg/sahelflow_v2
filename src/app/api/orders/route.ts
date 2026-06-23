import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/orders — list orders (optional ?status= filter) */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const orders = await orderService.list({ prisma: db }, {
    status: (status as "draft" | "pending" | "confirmed" | "shipped" | "delivered" | "returned" | "refused" | "cancelled") ?? undefined,
    limit: Math.min(limit, 100),
    offset,
  });

  return NextResponse.json({ orders });
}

/** POST /api/orders — create a new order (withErrorHandler pattern) */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const order = await orderService.create({ prisma: db }, body);
  return NextResponse.json({ order }, { status: 201 });
}, "POST /api/orders");
