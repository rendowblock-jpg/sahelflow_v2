import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { updateOrderStatusSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectOrderForTrustedActor } from "@/lib/identity/order-projection";
import { fireCapiStageForOrder } from "@/lib/meta/capi-triggers";

export const dynamic = "force-dynamic";

/** PATCH /api/orders/[id]/status — transition order to a new status */
export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const actorContext = await requireTrustedAction("orders.update");
    const { id } = await params;
    const body = await req.json();
    const data = updateOrderStatusSchema.parse(body);

    const order = await orderService.updateStatus({ prisma: db, shop: shopContext }, id, data.status);

    // FD-061 EX-3: fire-and-forget CAPI stage triggers on the legacy
    // transition path — a CAPI failure can never block the transition.
    if (data.status === "confirmed" || data.status === "delivered") {
      void fireCapiStageForOrder(id, data.status, data.status);
    }

    return NextResponse.json({
      order: projectOrderForTrustedActor(actorContext, order),
    });
  },
  "PATCH /api/orders/[id]/status",
);
