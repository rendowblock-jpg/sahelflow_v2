import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { recordOrderChangeInTx } from "@/lib/data/order-change-service";
import { ConflictError, InvalidTransitionError } from "@/types/errors";
import { assertLegacyOrderFollowupAllowed } from "@/lib/orders/manual-order-authority";

export const dynamic = "force-dynamic";

const syncSchema = z.object({
  deliveryId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
}).refine((d) => d.deliveryId || d.orderId, {
  message: "Either deliveryId or orderId is required",
});

/**
 * POST /api/delivery/sync — sync tracking for a shipment.
 *
 * Fetches the latest tracking info from the provider and updates the Delivery
 * record. If the shipment is delivered, updates the order status too.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = syncSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  // Find the delivery record
  const delivery = input.deliveryId
    ? await context.prisma.delivery.findFirst({
        where: { id: input.deliveryId, deletedAt: null },
      })
    : input.orderId
      ? await context.prisma.delivery.findFirst({
          where: { orderId: input.orderId, deletedAt: null },
        })
      : null;

  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  if (!delivery.trackingNumber) {
    return NextResponse.json(
      { error: "Pas de numéro de suivi pour cette expédition" },
      { status: 400 },
    );
  }
  const authority = await db.order.findFirst({
    where: { id: delivery.orderId, deletedAt: null },
    select: { source: true, sourceMetadata: true },
  });
  if (authority) {
    assertLegacyOrderFollowupAllowed(authority.source, authority.sourceMetadata);
  }

  const adapter = getDeliveryAdapter(delivery.provider);
  const creds = await loadDeliveryCredentials(
    context,
    delivery.provider,
  );

  const tracking = await adapter.syncTracking(delivery.trackingNumber, creds);
  const estimatedDelivery = tracking.estimatedDelivery
    ? new Date(tracking.estimatedDelivery)
    : null;

  let committed;
  try {
    committed = await context.prisma.$transaction(async (tx) => {
      const claimed = await tx.delivery.updateMany({
        where: {
          id: delivery.id,
          updatedAt: delivery.updatedAt,
          deletedAt: null,
        },
        data: { status: tracking.status, estimatedDelivery },
      });
      if (claimed.count !== 1) {
        throw new ConflictError("Delivery changed while provider tracking was being fetched");
      }

      if (tracking.status !== "delivered") {
        return { effects: null, conflict: null };
      }

      try {
        const effects = await orderService.updateStatusInTx(
          tx,
          delivery.orderId,
          "delivered",
          { actor: "system" },
        );
        return { effects, conflict: null };
      } catch (error) {
        if (!(error instanceof InvalidTransitionError)) throw error;

        await recordOrderChangeInTx(tx, {
          orderId: delivery.orderId,
          actionType: "delivery_sync_conflict",
          actor: "system",
          payload: {
            deliveryId: delivery.id,
            provider: delivery.provider,
            providerStatus: tracking.status,
            orderStatus: error.from,
            attemptedOrderStatus: error.to,
          },
        });
        return {
          effects: null,
          conflict: { orderStatus: error.from, providerStatus: tracking.status },
        };
      }
    });
  } catch (error) {
    let evidenceError: unknown;
    try {
      await context.prisma.$transaction(async (tx) => {
        const preserved = await tx.delivery.updateMany({
          where: {
            id: delivery.id,
            updatedAt: delivery.updatedAt,
            deletedAt: null,
          },
          data: { status: tracking.status, estimatedDelivery },
        });
        if (preserved.count !== 1) {
          const current = await tx.delivery.findUnique({ where: { id: delivery.id } });
          if (!current || current.status !== tracking.status) {
            throw new ConflictError("Provider tracking conflicts with newer local delivery state");
          }
        }

        const currentOrder = await tx.order.findUnique({
          where: { id: delivery.orderId },
          select: { status: true },
        });
        await recordOrderChangeInTx(tx, {
          orderId: delivery.orderId,
          actionType: "delivery_sync_conflict",
          actor: "system",
          payload: {
            deliveryId: delivery.id,
            provider: delivery.provider,
            providerStatus: tracking.status,
            orderStatus: currentOrder?.status ?? "missing",
            attemptedOrderStatus: tracking.status === "delivered" ? "delivered" : null,
            persistenceError: error instanceof Error ? error.name : "UnknownError",
          },
        });
      });
    } catch (failedEvidence) {
      evidenceError = failedEvidence;
      try {
        const preserved = await context.prisma.delivery.updateMany({
          where: {
            id: delivery.id,
            updatedAt: delivery.updatedAt,
            deletedAt: null,
          },
          data: { status: tracking.status, estimatedDelivery },
        });
        if (preserved.count !== 1) {
          const current = await context.prisma.delivery.findUnique({
            where: { id: delivery.id },
          });
          if (!current || current.status !== tracking.status) {
            throw new ConflictError("Provider tracking could not be preserved safely");
          }
        }
      } catch (preservationError) {
        throw new AggregateError(
          [error, evidenceError, preservationError],
          "Provider tracking and reconciliation evidence could not be persisted",
        );
      }
    }
    throw error;
  }

  if (committed.effects) {
    orderService.dispatchStatusTransition(context, committed.effects);
  }
  if (committed.conflict) {
    return NextResponse.json(
      {
        error: "Provider tracking conflicts with the current order state",
        reconciliationRequired: true,
        ...committed.conflict,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: tracking.status,
    events: tracking.events,
    estimatedDelivery: tracking.estimatedDelivery,
  });
}, "POST /api/delivery/sync");

/**
 * GET /api/delivery/sync?deliveryId=... — fetch tracking without updating.
 * Returns the current tracking info from the provider (read-only).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  // W2-4: defense-in-depth — GET was unprotected, exposed tracking info + delivery provider credentials usage.
  await requireAuth();
  const deliveryId = req.nextUrl.searchParams.get("deliveryId");
  if (!deliveryId) {
    return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
  }

  const delivery = await db.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }
  if (!delivery.trackingNumber) {
    return NextResponse.json(
      { error: "Pas de numéro de suivi" },
      { status: 400 },
    );
  }

  const adapter = getDeliveryAdapter(delivery.provider);
  const creds = await loadDeliveryCredentials(
    { prisma: db, shop: shopContext },
    delivery.provider,
  );
  const tracking = await adapter.syncTracking(delivery.trackingNumber, creds);

  return NextResponse.json({ tracking });
}, "GET /api/delivery/sync");
