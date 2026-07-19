/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { deliveryService } from "@/lib/data/delivery-service";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "pending", "created", "picked_up", "in_transit", "at_hub",
  "out_for_delivery", "delivered", "returned", "refused", "failed"
];

const updateSchema = z.object({
  status: z.enum(VALID_STATUSES as [string, ...string[]]),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const { status } = updateSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };

  // Route the lookup through the service so the soft-delete filter
  // (deletedAt: null) is applied. The previous direct `findUnique` would
  // happily operate on a soft-deleted delivery. NotFoundError → 404 via
  // withErrorHandler.
  const existing = await deliveryService.getById(context, id);

  const targetOrderStatus: OrderStatus | null =
    status === "delivered" ? "delivered" :
    status === "returned" ? "returned" :
    status === "refused" ? "refused" : null;
  const orderId = existing.orderId;

  const result = await context.prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.update({
      where: { id },
      data: { status },
    });

    const effects = orderId && targetOrderStatus
      ? await orderService.updateStatusInTx(tx, orderId, targetOrderStatus, { actor: "system" })
      : null;

    return { delivery, effects };
  });

  if (result.effects) {
    orderService.dispatchStatusTransition(context, result.effects);
  }

  return NextResponse.json({ delivery: result.delivery });
}, "PATCH /api/delivery/[id]");
