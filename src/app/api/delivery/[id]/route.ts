/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRouteAuth } from "@/lib/auth/route-authority";
import { db, shopContext } from "@/lib/db";
import { deliveryService } from "@/lib/data/delivery-service";
import { orderService } from "@/lib/data/order-service";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "pending",
  "created",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
  "delivered",
  "returned",
  "refused",
  "failed",
] as const;

const updateSchema = z.object({
  status: z.enum(VALID_STATUSES),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: RouteContext) => {
    await requireRouteAuth(req, {
      actions: ["deliveries.manage", "orders.read", "orders.update"],
    });
    const { id } = await params;
    const { status } = updateSchema.parse(await req.json());
    const context = { prisma: db, shop: shopContext };

    const existing = await deliveryService.getById(context, id);
    const authority = await db.order.findFirst({
      where: { id: existing.orderId, deletedAt: null },
      select: { source: true, sourceMetadata: true },
    });
    if (authority) {
      assertLegacyOrderFollowupAllowed(
        authority.source,
        authority.sourceMetadata,
      );
    }

    const targetOrderStatus: OrderStatus | null =
      status === "delivered"
        ? "delivered"
        : status === "returned"
          ? "returned"
          : status === "refused"
            ? "refused"
            : null;
    const orderId = existing.orderId;

    const result = await context.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.update({
        where: { id },
        data: { status },
      });

      const effects =
        orderId && targetOrderStatus
          ? await orderService.updateStatusInTx(tx, orderId, targetOrderStatus, {
              actor: "system",
            })
          : null;

      return { delivery, effects };
    });

    if (result.effects) {
      orderService.dispatchStatusTransition(context, result.effects);
    }

    return NextResponse.json({ delivery: result.delivery });
  },
  "PATCH /api/delivery/[id]",
);
