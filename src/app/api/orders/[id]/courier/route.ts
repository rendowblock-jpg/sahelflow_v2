import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import {
  drainDueCourierBookings,
  getCanonicalCourierPosition,
  queueCanonicalCourierBooking,
  reconcileCanonicalCourierBooking,
} from "@/lib/delivery/canonical-courier";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { CourierPosition } from "@/lib/delivery/canonical-courier";

export const dynamic = "force-dynamic";

const serviceContext = { prisma: db, shop: shopContext };

function projectCourierPosition(
  actorContext: TrustedActorContext,
  position: CourierPosition,
) {
  const financials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
  );
  return {
    ...position,
    delivery: position.delivery
      ? { ...position.delivery, cost: financials ? position.delivery.cost : null }
      : null,
    fieldAccess: { financials },
  };
}

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedAction("orders.read");
    assertTrustedAction(actorContext, "customers.contact.read");
    const { id } = await params;
    return NextResponse.json({
      position: projectCourierPosition(
        actorContext,
        await getCanonicalCourierPosition(serviceContext, id),
      ),
    });
  },
  "GET /api/orders/[id]/courier",
);

export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actor = await requireTrustedAction("orders.update");
    assertTrustedAction(actor, "customers.contact.read");
    const { id } = await params;
    const body = await request.json();
    const command = await queueCanonicalCourierBooking(
      {
        ...serviceContext,
        businessPrincipal: businessPrincipalFromTrustedActor(actor),
      },
      { ...body, orderId: id },
    );

    // The durable outbox remains authority. This bounded kick improves local UX;
    // instrumentation owns restart and eventual processing. A failed kick is
    // contained here so it cannot become an unhandled request-process rejection.
    void drainDueCourierBookings(serviceContext, 1).catch(() => undefined);

    return NextResponse.json(
      {
        booking: command.result,
        command: {
          id: command.commandId,
          aggregateVersion: command.aggregateVersion,
          replayed: command.replayed,
        },
      },
      { status: command.replayed ? 200 : 202 },
    );
  },
  "POST /api/orders/[id]/courier",
);

export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actor = await requireTrustedAction("orders.update");
    assertTrustedAction(actor, "customers.contact.read");
    const { id } = await params;
    const body = await request.json();
    const position = await getCanonicalCourierPosition(serviceContext, id);
    if (!position.delivery) {
      return NextResponse.json({ error: "Courier delivery not found" }, { status: 404 });
    }
    const command = await reconcileCanonicalCourierBooking(
      {
        ...serviceContext,
        businessPrincipal: businessPrincipalFromTrustedActor(actor),
      },
      { ...body, deliveryId: position.delivery.id },
    );
    return NextResponse.json({
      reconciliation: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "PATCH /api/orders/[id]/courier",
);
