/**
 * DELETE /api/orders/[id] — delete an order (only if draft or cancelled).
 * Orders with active status cannot be deleted for audit-trail integrity.
 */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import { hasCanonicalActiveReservation } from "@/lib/orders/manual-confirmation";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { reviseTrustedManualOrder } from "@/lib/orders/manual-order-revision";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    await requireAuth();
    const { id } = await params;
    const context = { prisma: db, shop: shopContext };

    const order = await db.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) {
      throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
    }
    if (!["draft", "cancelled"].includes(order.status)) {
      throw new SahelFlowError(
        "Cannot delete an active order. Cancel it first.",
        "CONFLICT",
        409,
      );
    }

    const returns = await db.return.findMany({
      where: { orderId: id },
      select: { id: true },
    });
    if (returns.length > 0) {
      throw new SahelFlowError(
        "Cannot delete an order with returns. Delete the returns first.",
        "CONFLICT",
        409,
      );
    }

    const updated = await context.prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, orderNumber: true, deletedAt: true },
    });

    void logAudit(context, {
      action: "order.deleted",
      entity: "order",
      entityId: id,
      actor: "user",
      after: {
        deletedAt: updated.deletedAt?.toISOString() ?? new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, record: updated });
  },
  "DELETE /api/orders/[id]",
);

/**
 * PATCH /api/orders/[id] — compatibility edit or trusted pending revision.
 *
 * Trusted manual orders use an expected-version CAS command. Compatibility
 * orders retain the existing edit service until their source is migrated.
 * Any active canonical reservation blocks the full legacy/CAS edit surface
 * before payload validation, preserving a consistent 409 conflict boundary.
 */
export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    await requireAuth();
    const { id } = await params;
    const context = { prisma: db, shop: shopContext };

    const current = await db.order.findFirst({
      where: { id, deletedAt: null },
      select: { source: true, sourceMetadata: true },
    });
    if (!current) {
      throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
    }

    if (await hasCanonicalActiveReservation(db, id)) {
      throw new SahelFlowError(
        `Order '${id}' has an active canonical reservation; use a governed edit command`,
        "CANONICAL_FOLLOWUP_REQUIRED",
        409,
      );
    }

    const body = await req.json();
    const trustedManual = isTrustedManualOrderAuthority(
      current.source,
      current.sourceMetadata,
    );
    const order = trustedManual
      ? await reviseTrustedManualOrder(context, id, body)
      : await orderService.update(context, id, body);

    return NextResponse.json({ order });
  },
  "PATCH /api/orders/[id]",
);
