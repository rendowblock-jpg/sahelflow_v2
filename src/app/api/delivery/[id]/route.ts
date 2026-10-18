/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 *
 * Governance (audit S03c-06):
 *   - the move is checked against an explicit transition table
 *     (`@/lib/delivery/delivery-status-transitions`) BEFORE anything is
 *     written; an impossible jump is a 409 INVALID_TRANSITION;
 *   - the write is a claim on the status that was checked, so a concurrent
 *     change cannot slip past the table (409 CONFLICT);
 *   - every real status change writes one `delivery.status.changed` audit row
 *     in the same transaction, after the order effects: a rolled-back change
 *     leaves no row, a committed change cannot lack one.
 * Canonical orders stay refused here (governed courier commands own them).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRouteAuth } from "@/lib/auth/route-authority";
import { deliveryService } from "@/lib/data/delivery-service";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import {
  DELIVERY_STATUSES,
  assertDeliveryStatusTransition,
} from "@/lib/delivery/delivery-status-transitions";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";
import type { OrderStatus } from "@/types/domain";
import { ConflictError } from "@/types/errors";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(DELIVERY_STATUSES),
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

    // S03c-06: refuse an impossible jump before anything is written.
    assertDeliveryStatusTransition(existing.status, status);

    const targetOrderStatus: OrderStatus | null =
      status === "delivered"
        ? "delivered"
        : status === "returned"
          ? "returned"
          : status === "refused"
            ? "refused"
            : null;
    const orderId = existing.orderId;
    const propagatedOrderStatus =
      orderId && targetOrderStatus ? targetOrderStatus : null;

    const result = await context.prisma.$transaction(async (tx) => {
      // Claim the row at the status the table was checked against, so a
      // concurrent change (provider sync, another tab) cannot slip past it.
      const claimed = await tx.delivery.updateMany({
        where: { id, deletedAt: null, status: existing.status },
        data: { status },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          "Delivery changed while its status was being updated",
        );
      }
      const delivery = await tx.delivery.findUniqueOrThrow({ where: { id } });

      const effects = propagatedOrderStatus
        ? await orderService.updateStatusInTx(
            tx,
            orderId,
            propagatedOrderStatus,
            { actor: "system" },
          )
        : null;

      // Last write in the transaction: if the order transition above threw,
      // the whole change rolls back and no audit row exists. A same-status
      // re-apply changes nothing about the delivery, so it is not a status
      // change and gets no row (the order ledger records any order effect).
      // No tracking number or contact detail goes into the row.
      if (existing.status !== status) {
        await tx.auditLog.create({
          data: {
            action: "delivery.status.changed",
            entity: "delivery",
            entityId: id,
            actor: "user",
            before: JSON.stringify({ status: existing.status }),
            after: JSON.stringify({ status }),
            metadata: JSON.stringify({
              orderId,
              provider: existing.provider,
              orderStatus: propagatedOrderStatus,
              via: "manual_override",
            }),
          },
        });
      }

      return { delivery, effects };
    });

    if (result.effects) {
      await orderService.dispatchStatusTransition(context, result.effects);
    }

    return NextResponse.json({ delivery: result.delivery });
  },
  "PATCH /api/delivery/[id]",
);
