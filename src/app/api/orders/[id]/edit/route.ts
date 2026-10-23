/**
 * POST /api/orders/[id]/edit — governed pre-confirmation edit
 * (order.manual.edit.v1, S03a-03). Version-checked and idempotent. It changes
 * the delivery destination, phone, notes and delivery fee of a PENDING
 * canonical order; lines and prices are not governed here.
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
import { executeManualOrderEdit } from "@/lib/orders/manual-order-edit";

export const dynamic = "force-dynamic";

const FIELD_KEYS = [
  "address",
  "commune",
  "deliveryCost",
  "notes",
  "phone",
  "wilaya",
] as const;

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

    // The contact fields need the contact permission and the delivery fee needs
    // the financial one, exactly as on the compatibility PATCH. Only the fields
    // actually sent are checked.
    const sent = Object.fromEntries(
      FIELD_KEYS.filter((key) => body[key] !== undefined).map((key) => [
        key,
        body[key],
      ]),
    );
    assertOrderUpdateFieldAuthority(actorContext, sent as never);

    const command = await executeManualOrderEdit(
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
        deliveryCost: command.result.deliveryCost,
        totalPrice: command.result.totalPrice,
      },
      changed: command.result.changed,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/edit",
);
