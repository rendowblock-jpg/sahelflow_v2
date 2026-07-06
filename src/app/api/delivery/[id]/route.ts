/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { deliveryService } from "@/lib/data/delivery-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

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

  // Route the lookup through the service so the soft-delete filter
  // (deletedAt: null) is applied. The previous direct `findUnique` would
  // happily operate on a soft-deleted delivery. NotFoundError → 404 via
  // withErrorHandler.
  const existing = await deliveryService.getById({ prisma: db }, id);

  // F-H5: wrap delivery.update + order status transition in a single tx so
  // they can't diverge. Previously a separate db.delivery.update followed by
  // orderService.updateStatus (which opens its OWN tx) — if the second
  // failed, the catch swallowed it → delivery showed "delivered" while the
  // order stayed "shipped". Now both succeed or both roll back.
  const updated = await db.$transaction(async (tx) => {
    const delivery = await tx.delivery.update({
      where: { id },
      data: { status },
    });

    // Transition the order status inside the same tx. We inline the state
    // machine + stock effects (can't call orderService.updateStatus because
    // it opens a nested $transaction that can't see this tx's writes).
    if (existing.orderId) {
      const orderStatus = status === "delivered" ? "delivered" :
                          status === "returned" ? "returned" :
                          status === "refused" ? "refused" : null;
      if (orderStatus) {
        const order = await tx.order.findFirst({
          where: { id: existing.orderId, deletedAt: null },
          include: { items: true },
        });
        if (order) {
          const from = order.status;
          // Only transition if it's a valid forward/lateral move (avoid
          // throwing on no-op or invalid transitions — non-fatal).
          const valid =
            (orderStatus === "delivered" && ["confirmed", "shipped"].includes(from)) ||
            (orderStatus === "returned" && ["confirmed", "shipped", "delivered"].includes(from)) ||
            (orderStatus === "refused" && ["confirmed", "shipped", "delivered"].includes(from));
          if (valid && from !== orderStatus) {
            await tx.order.update({
              where: { id: order.id },
              data: { status: orderStatus },
            });
            // Stock restoration on returned/refused (matches triggersStockRestoration,
            // now including "delivered" as a valid from-status per F-H1).
            if (["returned", "refused"].includes(orderStatus) &&
                ["confirmed", "shipped", "delivered"].includes(from)) {
              for (const item of order.items) {
                if (item.productId) {
                  await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } },
                  });
                }
              }
            }
            // Ledger entry (in-tx).
            await tx.orderChange.create({
              data: {
                orderId: order.id,
                actionType: "status_change",
                actor: "system",
                status: "confirmed",
                payload: JSON.stringify({ from, to: orderStatus, source: "delivery_sync" }),
              },
            });
          }
        }
      }
    }

    return delivery;
  });

  return NextResponse.json({ delivery: updated });
}, "PATCH /api/delivery/[id]");
