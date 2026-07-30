import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { NotFoundError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";

export const dynamic = "force-dynamic";

const createReturnSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  reason: z.string().min(1, "Reason is required").max(2000),
  type: z.enum(["return", "exchange"]).optional(),
  itemCount: z.number().int().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * GET /api/returns — list returns with pagination (?page=&pageSize=).
 *
 * Returns { returns, total, hasNextPage, page, pageSize }. Each return
 * includes its order + customer name for the table.
 */
export async function GET(req: NextRequest) {
  await requireAuth();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(parseInt(sp.get("pageSize") ?? "25", 10) || 25, 100);
  const offset = (page - 1) * pageSize;

  const where = { deletedAt: null };
  const [returns, total] = await Promise.all([
    db.return.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: offset,
    }),
    db.return.count({ where }),
  ]);

  const hasNextPage = offset + returns.length < total;
  return NextResponse.json({ returns, total, hasNextPage, page, pageSize });
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
  const context = { prisma: db, shop: shopContext };

  // Verify the order exists
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      source: true,
      sourceMetadata: true,
    },
  });

  if (!order) {
    throw new NotFoundError("Order", input.orderId);
  }
  assertLegacyOrderFollowupAllowed(order.source, order.sourceMetadata);

  // Append item count to notes if provided (the Return model has no
  // dedicated itemCount field, so we store it alongside merchant notes).
  const notesParts: string[] = [];
  if (input.itemCount) {
    notesParts.push(`Items returned: ${input.itemCount}`);
  }
  if (input.notes) {
    notesParts.push(input.notes);
  }

  const record = await context.prisma.return.create({
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
