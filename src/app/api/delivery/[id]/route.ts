/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
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

  const existing = await db.delivery.findUnique({ where: { id } });
  if (!existing) {
    throw new SahelFlowError("Delivery not found", "NOT_FOUND", 404);
  }

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
