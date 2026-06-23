/**
 * GET /api/customers/search?q=...&limit=50 — search customers.
 *
 * Searches by name or phone. Returns enriched list with order count,
 * total spent, and risk score for each customer.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customerServiceExtensions } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  const customers = await customerServiceExtensions.search({ prisma: db }, q, { limit, offset });
  return NextResponse.json({ customers, total: customers.length, query: q });
}
