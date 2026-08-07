import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";
import { getReturnWorkbenchPage } from "@/lib/returns/return-workbench";
import { NotFoundError } from "@/types/errors";

export const dynamic = "force-dynamic";

const createReturnSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  reason: z.string().min(1, "Reason is required").max(2000),
  type: z.enum(["return", "exchange"]).optional(),
  itemCount: z.number().int().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

/** GET /api/returns — canonical permission-aware returns workbench. */
export async function GET(req: NextRequest) {
  const actorContext = await requireTrustedAction("orders.read");
  const searchParams = req.nextUrl.searchParams;
  return NextResponse.json(
    await getReturnWorkbenchPage(actorContext, {
      page: Number.parseInt(searchParams.get("page") ?? "1", 10),
      pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
    }),
  );
}

/** POST /api/returns — create a return / exchange request for an order. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("orders.update");
  assertTrustedAction(actorContext, "customers.contact.read");
  const input = createReturnSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };
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
  if (!order) throw new NotFoundError("Order", input.orderId);
  assertLegacyOrderFollowupAllowed(order.source, order.sourceMetadata);

  const notesParts: string[] = [];
  if (input.itemCount) notesParts.push(`Items returned: ${input.itemCount}`);
  if (input.notes) notesParts.push(input.notes);
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
