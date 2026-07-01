import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { NotFoundError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const createReturnSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  reason: z.string().min(1, "Reason is required").max(2000),
  type: z.enum(["return", "exchange"]).optional(),
  itemCount: z.number().int().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * GET /api/returns — list returns (most recent first).
 */
export async function GET() {
  const returns = await db.return.findMany({
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ returns });
}

/**
 * POST /api/returns — create a return / exchange request for an order.
 *
 * Merchants create a return when a customer sends an item back. The return
 * starts in "requested" status and is tracked through the returns workflow
 * (approved → inspected → refunded/exchanged → completed).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = createReturnSchema.parse(body);

  // Verify the order exists
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, orderNumber: true, status: true },
  });

  if (!order) {
    throw new NotFoundError("Order", input.orderId);
  }

  // Append item count to notes if provided (the Return model has no
  // dedicated itemCount field, so we store it alongside merchant notes).
  const notesParts: string[] = [];
  if (input.itemCount) {
    notesParts.push(`Items returned: ${input.itemCount}`);
  }
  if (input.notes) {
    notesParts.push(input.notes);
  }

  const record = await db.return.create({
    data: {
      orderId: input.orderId,
      reason: input.reason,
      type: input.type ?? "return",
      status: "requested",
      notes: notesParts.length > 0 ? notesParts.join("\n") : null,
    },
    include: { order: { select: { orderNumber: true } } },
  });

  return NextResponse.json({ return: record }, { status: 201 });
}, "POST /api/returns");
