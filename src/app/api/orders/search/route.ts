/**
 * GET /api/orders/search?q=...&status=...&limit=50 — search orders.
 *
 * Searches by order number, customer name, phone, or wilaya.
 * Optional status filter. Returns enriched order rows with items +
 * customer name.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderServiceExtensions } from "@/lib/data";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const status = req.nextUrl.searchParams.get("status") as OrderStatus | null;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  const [results, total] = await Promise.all([
    orderServiceExtensions.search({ prisma: db }, q, { limit, offset, status: status ?? undefined }),
    orderServiceExtensions.countSearch({ prisma: db }, q, { status: status ?? undefined }),
  ]);

  return NextResponse.json({ orders: results, total, query: q });
}
