import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryService } from "@/lib/data/delivery-service";
import type { DeliveryStatus } from "@/types/domain";
import { requireAuth } from "@/lib/auth/server";
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
 *
 * Routed through `deliveryService.list` (with the optional `include` param) so
 * the service's soft-delete filter + pagination logic is the single source of
 * truth (was previously duplicated in this route as a direct `db.delivery.findMany`).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(parseInt(sp.get("pageSize") ?? "25", 10) || 25, 100);
  const status = sp.get("status");
  const offset = (page - 1) * pageSize;

  // Service.list applies the soft-delete filter (deletedAt: null) + status filter.
  // We pass `include` so the joined order + customer rows come back in the same
  // query (avoids an N+1 enrichment pass).
  const include = {
    order: { include: { customer: { select: { name: true, phone: true } } } },
  };

  const statusFilter =
    status && status !== "all" ? { status: status as DeliveryStatus } : {};

  const [deliveries, total] = await Promise.all([
    deliveryService.list(
      { prisma: db },
      {
        limit: pageSize,
        offset,
        ...(status && status !== "all" ? { status: status as DeliveryStatus } : {}),
        include,
      },
    ),
    db.delivery.count({ where: { deletedAt: null, ...statusFilter } }),
  ]);

  const hasNextPage = offset + deliveries.length < total;
  return NextResponse.json({ deliveries, total, hasNextPage, page, pageSize });
}, "GET /api/delivery");
