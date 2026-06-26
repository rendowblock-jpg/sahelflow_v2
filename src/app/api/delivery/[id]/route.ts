/**
 * PATCH /api/delivery/[id] — manually update delivery status.
 *
 * Useful for offline providers or correcting sync errors.
 * Body: { status: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";

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

  // If delivered, also update the order status
  if (status === "delivered" && existing.orderId) {
    await db.order.update({
      where: { id: existing.orderId },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  } else if ((status === "returned" || status === "refused") && existing.orderId) {
    await db.order.update({
      where: { id: existing.orderId },
      data: { status: status === "returned" ? "returned" : "refused" },
    });
  }

  return NextResponse.json({ delivery: updated });
}, "PATCH /api/delivery/[id]");
