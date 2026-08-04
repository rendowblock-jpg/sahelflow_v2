import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRouteAuth } from "@/lib/auth/route-authority";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import {
  getDeliveryAdapter,
  loadDeliveryCredentials,
} from "@/lib/integrations/delivery";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { assertProviderCapability } from "@/lib/integrations/delivery/provider-capability";
import { ConflictError, SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(["yalidine", "maystro", "zrexpress", "noest"]),
});

class ExistingShipmentError extends ConflictError {
  constructor(public readonly trackingNumber: string) {
    super(`Shipment already exists for this order (${trackingNumber})`);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002",
  );
}

/**
 * POST /api/delivery/create — create a shipment with the delivery provider.
 *
 * A local Delivery reservation commits before the provider call. Concurrent
 * requests and ambiguous retries therefore fail closed. Provider receipts
 * that cannot complete the order transition remain marked for reconciliation.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireRouteAuth(req, {
    actions: [
      "deliveries.manage",
      "orders.read",
      "orders.update",
      "customers.contact.read",
      "orders.financials.read",
    ],
  });
  const body = await req.json();
  const input = createSchema.parse(body);
  const context = { prisma: db, shop: shopContext };
  await assertProviderCapability(context, input.provider, "booking");
  const adapter = getDeliveryAdapter(input.provider);
  const creds = await loadDeliveryCredentials(context, input.provider);

  let reserved;
  try {
    reserved = await context.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.orderId, deletedAt: null },
        include: { customer: true, items: true },
      });
      if (!order) {
        throw new SahelFlowError("Order not found", "NOT_FOUND", 404);
      }
      if (isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
        throw new SahelFlowError(
          "Canonical manual orders require a governed fulfillment command before any provider call",
          "CANONICAL_FOLLOWUP_REQUIRED",
          409,
        );
      }
      const existing = await tx.delivery.findUnique({
        where: { orderId: order.id },
      });
      if (existing?.trackingNumber) {
        throw new ExistingShipmentError(existing.trackingNumber);
      }
      if (existing) {
        if (existing.deletedAt) {
          return {
            blocked: true as const,
            reason: "A deleted shipment record requires manual reconciliation",
          };
        }
        if (
          existing.status !== "creating" &&
          existing.status !== "reconciliation_required"
        ) {
          await tx.delivery.update({
            where: { id: existing.id },
            data: { status: "reconciliation_required" },
          });
        }
        return {
          blocked: true as const,
          reason:
            existing.status === "creating"
              ? "Shipment creation is already in progress"
              : "An existing shipment record without tracking requires manual reconciliation",
        };
      }
      if (order.status === "shipped") {
        throw new SahelFlowError(
          `Order cannot safely create a shipment from status '${order.status}'; manual reconciliation is required`,
          "CONFLICT",
          409,
        );
      }
      if (order.status !== "confirmed") {
        throw new SahelFlowError(
          `Order must be confirmed before shipping (current status: ${order.status})`,
          "VALIDATION_ERROR",
          400,
        );
      }

      const reservation = await tx.delivery.create({
        data: {
          orderId: order.id,
          provider: input.provider,
          status: "creating",
        },
      });

      return { blocked: false as const, order, reservation };
    });
  } catch (error) {
    if (error instanceof ExistingShipmentError) {
      return NextResponse.json(
        {
          error: "Shipment already exists for this order",
          trackingNumber: error.trackingNumber,
        },
        { status: 409 },
      );
    }
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("Shipment creation is already in progress");
    }
    throw error;
  }

  if (reserved.blocked) {
    return NextResponse.json(
      { error: reserved.reason, reconciliationRequired: true },
      { status: 409 },
    );
  }

  const { order, reservation } = reserved;

  let result: Awaited<ReturnType<typeof adapter.createShipment>>;
  try {
    result = await adapter.createShipment(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customer: {
          name: order.customer.name,
          phone: order.customer.phone,
          wilaya: order.wilaya,
          commune: order.commune,
          address: order.address,
        },
        items: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        totalPrice: order.totalPrice,
        weight: Math.max(
          1,
          order.items.reduce((sum, item) => sum + item.quantity, 0),
        ),
        notes: order.notes ?? undefined,
      },
      creds,
    );
  } catch (error) {
    try {
      const marked = await context.prisma.delivery.updateMany({
        where: { id: reservation.id, trackingNumber: null },
        data: { status: "reconciliation_required" },
      });
      if (marked.count !== 1) {
        throw new ConflictError(
          "Shipment reservation could not record its ambiguous outcome",
        );
      }
    } catch (reconciliationError) {
      throw new AggregateError(
        [error, reconciliationError],
        "Shipment outcome is ambiguous and reconciliation evidence could not be persisted",
      );
    }
    throw error;
  }

  if (!result.success) {
    const marked = await context.prisma.delivery.updateMany({
      where: { id: reservation.id, trackingNumber: null },
      data: { status: "reconciliation_required" },
    });
    if (marked.count !== 1) {
      throw new ConflictError(
        "Shipment reservation could not record the provider failure",
      );
    }
    return NextResponse.json(
      {
        error: result.error ?? "Failed to create shipment",
        reconciliationRequired: true,
      },
      { status: 502 },
    );
  }

  const trackingNumber =
    typeof result.trackingId === "string" ? result.trackingId.trim() : "";
  if (!trackingNumber) {
    const marked = await context.prisma.delivery.updateMany({
      where: { id: reservation.id, trackingNumber: null },
      data: { status: "reconciliation_required" },
    });
    if (marked.count !== 1) {
      throw new ConflictError(
        "Shipment reservation could not record the missing provider receipt",
      );
    }
    return NextResponse.json(
      {
        error: "Provider reported shipment creation without a tracking number",
        reconciliationRequired: true,
      },
      { status: 502 },
    );
  }

  const estimatedDelivery = result.estimatedDelivery
    ? new Date(result.estimatedDelivery)
    : null;
  let committed;
  try {
    committed = await context.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findFirst({
        where: { id: order.id, deletedAt: null },
        select: { updatedAt: true },
      });
      if (
        !currentOrder ||
        currentOrder.updatedAt.getTime() !== order.updatedAt.getTime()
      ) {
        throw new ConflictError(
          "Order changed while the provider shipment was being created",
        );
      }

      const claimed = await tx.delivery.updateMany({
        where: {
          id: reservation.id,
          status: "creating",
          trackingNumber: null,
          deletedAt: null,
        },
        data: {
          provider: input.provider,
          trackingNumber,
          labelUrl: result.labelUrl ?? null,
          cost: result.cost,
          status: "created",
          estimatedDelivery,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          "Shipment reservation changed before provider completion",
        );
      }
      const delivery = await tx.delivery.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      const effects = await orderService.updateStatusInTx(
        tx,
        order.id,
        "shipped",
      );
      return { delivery, effects };
    });
  } catch (error) {
    try {
      const reconciled = await context.prisma.delivery.updateMany({
        where: {
          id: reservation.id,
          OR: [{ trackingNumber: null }, { trackingNumber }],
        },
        data: {
          provider: input.provider,
          trackingNumber,
          labelUrl: result.labelUrl ?? null,
          cost: result.cost,
          status: "reconciliation_required",
          estimatedDelivery,
        },
      });
      if (reconciled.count !== 1) {
        throw new ConflictError(
          "Provider receipt conflicts with the local shipment reservation",
        );
      }
    } catch (reconciliationError) {
      throw new AggregateError(
        [error, reconciliationError],
        "Provider created a shipment but its reconciliation receipt could not be persisted",
      );
    }
    throw error;
  }

  await orderService.dispatchStatusTransition(context, committed.effects);

  return NextResponse.json({
    ok: true,
    delivery: committed.delivery,
    labelUrl: result.labelUrl,
  });
}, "POST /api/delivery/create");
