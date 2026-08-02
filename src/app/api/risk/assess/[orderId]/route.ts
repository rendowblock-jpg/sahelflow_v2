import { NextRequest, NextResponse } from "next/server";
import { assessOrderRisk } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORDER_RISK_READ_ACTIONS = [
  "risk.read",
  "orders.read",
  "customers.read",
  "customers.contact.read",
  "orders.financials.read",
] as const;

/** GET /api/risk/assess/[orderId] — assess the risk of a specific order */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  await requireAuth(ORDER_RISK_READ_ACTIONS);
  const { orderId } = await params;
  const assessment = await assessOrderRisk({ prisma: db, shop: shopContext }, orderId);
  if (!assessment) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ assessment });
}

/** POST /api/risk/assess/[orderId] — re-assess (force refresh) */
export const POST = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) => {
  await requireAuth(ORDER_RISK_READ_ACTIONS);
  const { orderId } = await params;
  const assessment = await assessOrderRisk({ prisma: db, shop: shopContext }, orderId);
  if (!assessment) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ assessment });
}, "POST /api/risk/assess/[orderId]");
