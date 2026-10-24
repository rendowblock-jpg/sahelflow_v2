/**
 * POST /api/orders/[id]/lines - governed correction of the LINES of a pending order
 * the seller typed in (order.manual.editLines.v1, S03a-03B). Version-checked and
 * idempotent. The new list replaces the old one: a line with an id changes quantity
 * and/or price, a line with a product is added, a line left out is removed.
 * Any other kind of order answers a coded 409.
 */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { assertOrderUpdateFieldAuthority } from "@/lib/identity/order-authorization";
import { executeManualOrderLinesEdit } from "@/lib/orders/manual-order-lines-edit";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const actorContext = await requireTrustedAction("orders.update");
    assertTrustedAction(actorContext, "orders.read", {
      shopId: actorContext.shop.shopId,
    });
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    // Lines and prices are money: the same financial authority as the `items` field
    // of the compatibility update. The command validates the shape of the list.
    assertOrderUpdateFieldAuthority(
      actorContext,
      { items: body.lines } as never,
    );

    const command = await executeManualOrderLinesEdit(
      {
        prisma: db,
        shop: actorContext.shop,
        businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
      },
      // The path decides the order; a body that names another one is ignored.
      { ...body, orderId: id },
    );

    return NextResponse.json({
      order: {
        id: command.result.orderId,
        orderNumber: command.result.orderNumber,
        status: command.result.status,
        version: command.result.version,
        itemsTotal: command.result.itemsTotal,
        deliveryCost: command.result.deliveryCost,
        totalPrice: command.result.totalPrice,
      },
      lines: {
        added: command.result.added,
        removed: command.result.removed,
        changed: command.result.changed,
      },
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/lines",
);
