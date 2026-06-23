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

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stats = await customerServiceExtensions.getStats({ prisma: db }, id);
  return NextResponse.json({ stats });
}
