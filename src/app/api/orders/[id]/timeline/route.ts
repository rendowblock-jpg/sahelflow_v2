/** GET /api/orders/[id]/timeline — order change ledger (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getOrderTimeline } from "@/lib/data/order-change-service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const entries = await getOrderTimeline(id);
  return NextResponse.json({ entries });
}, "GET /api/orders/[id]/timeline");
