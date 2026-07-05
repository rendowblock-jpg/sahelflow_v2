import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(["yalidine", "maystro", "zrexpress", "dhd"]),
});

/**
 * POST /api/delivery/create — create a shipment with the delivery provider.
 *
 * Reads the order + customer from the DB, calls the provider's API, and
 * updates the Delivery record with the tracking number + cost.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = createSchema.parse(body);

  // Fetch the order + customer
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "confirmed" && order.status !== "shipped") {
    return NextResponse.json(
      { error: `Order must be confirmed before shipping avant l'expédition (statut actuel: ${order.status})` },
      { status: 400 },
    );
  }

  const adapter = getDeliveryAdapter(input.provider);
  const creds = await loadDeliveryCredentials(input.provider);

  const result = await adapter.createShipment(
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
      items: order.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      totalPrice: order.totalPrice,
      weight: Math.max(1, order.items.reduce((sum, i) => sum + i.quantity, 0)), // Estimate: 1kg per unit, minimum 1kg
      notes: order.notes ?? undefined,
    },
    creds,
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to create shipment" },
      { status: 502 },
    );
  }

  // Create/update the Delivery record + update order status in a transaction.
  // Route the status update through orderService.updateStatus to enforce the
  // state machine + fire automation triggers (was raw db.order.update bypass).
  const { orderService } = await import("@/lib/data/order-service");
  const [delivery] = await db.$transaction(async (tx) => {
    const d = await tx.delivery.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: input.provider,
        trackingNumber: result.trackingId,
        cost: result.cost,
        status: "created",
        estimatedDelivery: result.estimatedDelivery
          ? new Date(result.estimatedDelivery)
          : null,
      },
      update: {
        provider: input.provider,
        trackingNumber: result.trackingId,
        cost: result.cost,
        status: "created",
        estimatedDelivery: result.estimatedDelivery
          ? new Date(result.estimatedDelivery)
          : null,
      },
    });
    return [d];
  });

  // Update order status via the service (enforces state machine + triggers)
  await orderService.updateStatus({ prisma: db }, order.id, "shipped");

  return NextResponse.json({
    ok: true,
    delivery,
    labelUrl: result.labelUrl,
  });
}, "POST /api/delivery/create");
