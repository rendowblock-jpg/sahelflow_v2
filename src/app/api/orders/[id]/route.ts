/**
 * GET/PATCH/DELETE /api/orders/[id] — permission-governed order detail and
 * compatibility mutation surface.
 */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { projectOrderForTrustedActor } from "@/lib/identity/order-projection";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("orders.read");
    const { id } = await params;
    const order = await orderService.getById(
      { prisma: db, shop: shopContext },
      id,
    );
    return NextResponse.json({
      order: projectOrderForTrustedActor(actorContext, order),
    });
  },
  "GET /api/orders/[id]",
);

/**
 * DELETE /api/orders/[id] — soft-delete only draft/cancelled legacy orders.
 */
export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("orders.delete");
    const { id } = await params;
    const context = { prisma: db, shop: shopContext };

    const order = await db.order.findUnique({
      where: { id },
      select: { status: true, source: true, sourceMetadata: true },
    });

    if (!order) {
      throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
    }

    if (isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
      throw new SahelFlowError(
        "Canonical manual orders require a governed deletion command",
        "CANONICAL_FOLLOWUP_REQUIRED",
        409,
      );
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

    await logAudit(context, {
      action: "order.deleted",
      entity: "order",
      entityId: id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        deletedAt: updated.deletedAt?.toISOString() ?? new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, record: updated });
  },
  "DELETE /api/orders/[id]",
);

/**
 * PATCH /api/orders/[id] — update compatibility order fields. Canonical status
 * and lifecycle changes remain governed by their dedicated commands.
 */
export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    await requireTrustedAction("orders.update");
    const { id } = await params;
    const body = await req.json();
    const order = await orderService.update(
      { prisma: db, shop: shopContext },
      id,
      body,
    );
    return NextResponse.json({ order });
  },
  "PATCH /api/orders/[id]",
);
