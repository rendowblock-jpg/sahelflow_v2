/**
 * PATCH /api/returns/[id] — update return status (requested → approved → completed / rejected)
 *
 * SEC-016/CODE-013/CODE-029: return update + returnNote create + stock restoration +
 * customer stats adjustment are all in a single $transaction. A failure on any
 * step rolls back all changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const returnStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "completed"]),
  notes: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireTrustedAction("orders.update");
  const { id } = await params;
  const body = await req.json();
  const { status, notes } = returnStatusSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  const ALLOWED: Record<string, string[]> = {
    requested: ["approved", "rejected"],
    approved: ["completed", "rejected"],
    rejected: [],
    completed: [],
  };
  const result = await context.prisma.$transaction(async (tx) => {
    const existing = await tx.return.findUnique({ where: { id } });
    if (!existing) {
      throw new SahelFlowError("Return not found", "NOT_FOUND", 404);
    }

    const allowed = ALLOWED[existing.status] ?? [];
    if (!allowed.includes(status)) {
      throw new SahelFlowError(
        `Cannot transition from ${existing.status} to ${status}`,
        "CONFLICT",
        409,
      );
    }

    const updated = await tx.return.update({ where: { id }, data: { status } });

    if (notes) {
      await tx.returnNote.create({ data: { returnId: id, body: notes } });
    }

    const effects = status === "completed"
      ? await orderService.updateStatusInTx(tx, existing.orderId, "returned", { actor: "system" })
      : null;

    return { updated, effects };
  });

  if (result.effects) {
    orderService.dispatchStatusTransition(context, result.effects);
  }

  return NextResponse.json({ return: result.updated });
}, "PATCH /api/returns/[id]");
