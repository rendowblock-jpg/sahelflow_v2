/**
 * PATCH /api/returns/[id] — update return status (requested → approved → completed / rejected)
 *
 * SEC-016/CODE-013/CODE-029: return update + returnNote create + stock restoration +
 * customer stats adjustment are all in a single $transaction. A failure on any
 * step rolls back all changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const returnStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "completed"]),
  notes: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const { status, notes } = returnStatusSchema.parse(body);

  const existing = await db.return.findUnique({ where: { id } });
  if (!existing) {
    throw new SahelFlowError("Return not found", "NOT_FOUND", 404);
  }

  const currentStatus = existing.status;
  const ALLOWED: Record<string, string[]> = {
    requested: ["approved", "rejected"],
    approved: ["completed", "rejected"],
    rejected: [],
    completed: [],
  };
  const allowed = ALLOWED[currentStatus] ?? [];
  if (!allowed.includes(status)) {
    throw new SahelFlowError(
      `Cannot transition from ${currentStatus} to ${status}`,
      "CONFLICT",
      409,
    );
  }

  // SEC-016/CODE-013: transactional return update + note + stock restoration + customer stats
  const updated = await db.$transaction(async (tx) => {
    const ret = await tx.return.update({ where: { id }, data: { status } });

    if (notes) {
      await tx.returnNote.create({ data: { returnId: id, body: notes } });
    }

    // CODE-013: when return is completed, restore stock + adjust customer stats
    if (status === "completed") {
      const order = await tx.order.findUnique({
        where: { id: existing.orderId },
        include: { items: true },
      });
      if (order) {
        // Restore stock for each order item
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }
        // Adjust customer stats (decrement totalSpent by the order total)
        await tx.customer.update({
          where: { id: order.customerId },
          data: { totalSpent: { decrement: order.totalPrice } },
        });
      }
    }

    return ret;
  });

  return NextResponse.json({ return: updated });
}, "PATCH /api/returns/[id]");
