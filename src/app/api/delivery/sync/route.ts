import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { db } from "@/lib/db";
import type { DeliveryStatus } from "@/lib/integrations/delivery/types";

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
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = syncSchema.parse(body);

    // Find the delivery record
    const delivery = input.deliveryId
      ? await db.delivery.findUnique({ where: { id: input.deliveryId } })
      : await db.delivery.findUnique({ where: { orderId: input.orderId! } });

    if (!delivery) {
      return NextResponse.json({ error: "Expédition introuvable" }, { status: 404 });
    }
    if (!delivery.trackingNumber) {
      return NextResponse.json(
        { error: "Pas de numéro de suivi pour cette expédition" },
        { status: 400 },
      );
    }

    const adapter = getDeliveryAdapter(delivery.provider);
    const creds = await loadDeliveryCredentials(delivery.provider);

    const tracking = await adapter.syncTracking(delivery.trackingNumber, creds);

    // Update the delivery record
    await db.delivery.update({
      where: { id: delivery.id },
      data: {
        status: tracking.status,
        estimatedDelivery: tracking.estimatedDelivery
          ? new Date(tracking.estimatedDelivery)
          : null,
      },
    });

    // If delivered, update the order
    if (tracking.status === "delivered") {
      await db.order.update({
        where: { id: delivery.orderId },
        data: {
          status: "delivered",
          deliveredAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: tracking.status,
      events: tracking.events,
      estimatedDelivery: tracking.estimatedDelivery,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[POST /api/delivery/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/delivery/sync?deliveryId=... — fetch tracking without updating.
 * Returns the current tracking info from the provider (read-only).
 */
export async function GET(req: NextRequest) {
  try {
    const deliveryId = req.nextUrl.searchParams.get("deliveryId");
    if (!deliveryId) {
      return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
    }

    const delivery = await db.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      return NextResponse.json({ error: "Expédition introuvable" }, { status: 404 });
    }
    if (!delivery.trackingNumber) {
      return NextResponse.json(
        { error: "Pas de numéro de suivi" },
        { status: 400 },
      );
    }

    const adapter = getDeliveryAdapter(delivery.provider);
    const creds = await loadDeliveryCredentials(delivery.provider);
    const tracking = await adapter.syncTracking(delivery.trackingNumber, creds);

    return NextResponse.json({ tracking });
  } catch (err) {
    console.error("[GET /api/delivery/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

// Unused import guard (DeliveryStatus used for type clarity in future extensions)
void (undefined as unknown as DeliveryStatus);
