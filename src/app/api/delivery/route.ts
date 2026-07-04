import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery — list deliveries with pagination + optional status filter.
 *
 * Query params:
 *   page, pageSize — pagination (1-based, default 25, max 100)
 *   status         — filter by delivery status (pending/in_transit/delivered/...)
 *
 * Returns { deliveries, total, hasNextPage, page, pageSize }.
 * Each delivery includes its order + customer (name, phone) for the table.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(parseInt(sp.get("pageSize") ?? "25", 10) || 25, 100);
  const status = sp.get("status");
  const offset = (page - 1) * pageSize;

  const where = {
    deletedAt: null,
    ...(status && status !== "all" ? { status } : {}),
  };

  const [deliveries, total] = await Promise.all([
    db.delivery.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: offset,
    }),
    db.delivery.count({ where }),
  ]);

  const hasNextPage = offset + deliveries.length < total;
  return NextResponse.json({ deliveries, total, hasNextPage, page, pageSize });
}, "GET /api/delivery");
