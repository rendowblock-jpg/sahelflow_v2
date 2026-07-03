import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { assessOrderRisk } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { orderStatusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/orders — list orders with pagination (optional ?status= filter)
 *
 * Phase 1: added `total` + `hasNextPage` for the DataTable v2 pagination UI.
 * Supports both offset (`limit`/`offset`) and page-based (`page`/`pageSize`)
 * query params. The DataTable uses page-based.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const rawStatus = searchParams.get("status");
  const status = rawStatus && orderStatusSchema.safeParse(rawStatus).success ? rawStatus : undefined;

  // Page-based pagination (1-based page, pageSize). Falls back to limit/offset.
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;

  const statusFilter = (status as "draft" | "pending" | "confirmed" | "shipped" | "delivered" | "returned" | "refused" | "cancelled") ?? undefined;

  // Fetch page + total count in parallel (single round-trip feel)
  const [orders, total] = await Promise.all([
    orderService.list({ prisma: db }, { status: statusFilter, limit, offset }),
    db.order.count({ where: { deletedAt: null, ...(statusFilter ? { status: statusFilter } : {}) } }),
  ]);

  const hasNextPage = offset + orders.length < total;

  return NextResponse.json({ orders, total, hasNextPage, page, pageSize: limit });
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
