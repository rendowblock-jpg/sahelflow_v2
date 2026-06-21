import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

/** GET /api/orders — list orders (optional ?status= filter) */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status") as OrderStatus | null;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const orders = await orderService.list({ prisma: db }, {
    status: status ?? undefined,
    limit: Math.min(limit, 100),
    offset,
  });

  return NextResponse.json({ orders });
}
