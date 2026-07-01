/**
 * GET /api/customers/[id]/stats — Customer 360 stats.
 *
 * Returns aggregated stats: total orders, LTV (total spent), delivery
 * rate, avg order value, delivered/returned counts, first/last order
 * dates. Powers the customer detail page's stats cards.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerServiceExtensions } from "@/lib/data";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (
  _req: NextRequest,
  { params }: RouteContext,
) => {
  await requireAuth();
  const { id } = await params;
  const stats = await customerServiceExtensions.getStats({ prisma: db }, id);
  return NextResponse.json({ stats });
}, "GET /api/customers/[id]/stats");
