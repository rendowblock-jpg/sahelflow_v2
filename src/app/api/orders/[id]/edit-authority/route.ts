import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { NotFoundError } from "@/types/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth();
    const { id } = await params;
    const order = await db.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        source: true,
        sourceMetadata: true,
        version: true,
      },
    });
    if (!order) throw new NotFoundError("Order", id);

    const activeReservations = await db.$queryRaw<
      Array<{ present: number | bigint }>
    >`
      SELECT 1 AS "present"
      FROM "InventoryReservation"
      WHERE "orderId" = ${id}
        AND "state" = 'active'
      LIMIT 1
    `;
    const trustedManual = isTrustedManualOrderAuthority(
      order.source,
      order.sourceMetadata,
    );

    return NextResponse.json({
      orderId: id,
      version: order.version,
      trustedManual,
      activeReservation: activeReservations.length > 0,
      legacyPricingEditable:
        !trustedManual && activeReservations.length === 0,
    });
  },
  "GET /api/orders/[id]/edit-authority",
);
