import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  orderId: z.string().min(1),
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
});

/**
 * POST /api/delivery/create — create a shipment with the delivery provider.
 *
 * Reads the order + customer from the DB, calls the provider's API, and
 * updates the Delivery record with the tracking number + cost.
 */
export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    if (order.status !== "confirmed" && order.status !== "shipped") {
      return NextResponse.json(
        { error: `La commande doit être confirmée avant l'expédition (statut actuel: ${order.status})` },
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
        weight: 1, // TODO: calculate from product weights (not yet in schema)
        notes: order.notes ?? undefined,
      },
      creds,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Échec de la création de l'expédition" },
        { status: 502 },
      );
    }

    // Create or update the Delivery record
    const delivery = await db.delivery.upsert({
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

    // Update order status to shipped + record shipping date
    await db.order.update({
      where: { id: order.id },
      data: {
        status: "shipped",
        shippedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      delivery,
      labelUrl: result.labelUrl,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[POST /api/delivery/create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
