/** GET /api/orders/[id]/timeline — order change ledger (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { getOrderTimeline } from "@/lib/data/order-change-service";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: NextRequest, { params }: Ctx) => {
  const actorContext = await requireTrustedAction("orders.read");
  const { id } = await params;
  const entries = await getOrderTimeline({ prisma: db, shop: shopContext }, id);
  const canReadDetails =
    trustedActionAllowed(actorContext, "customers.contact.read") &&
    trustedActionAllowed(actorContext, "orders.financials.read");
  return NextResponse.json({
    entries: entries.map((entry) => ({
      ...entry,
      payload: canReadDetails ? entry.payload : null,
      fieldAccess: { details: canReadDetails },
    })),
  });
}, "GET /api/orders/[id]/timeline");
