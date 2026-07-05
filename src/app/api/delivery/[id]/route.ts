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
import { orderService } from "@/lib/data/order-service";
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

  const updated = await db.delivery.update({
    where: { id },
    data: { status },
  });

  // Use orderService.updateStatus for proper state machine + customer stats + stock
  if (existing.orderId) {
    const orderStatus = status === "delivered" ? "delivered" :
                        status === "returned" ? "returned" :
                        status === "refused" ? "refused" : null;
    if (orderStatus) {
      try {
        await orderService.updateStatus({ prisma: db }, existing.orderId, orderStatus as never);
      } catch {
        // Transition may not be allowed — non-fatal
      }
    }
  }

  return NextResponse.json({ delivery: updated });
}, "PATCH /api/delivery/[id]");
