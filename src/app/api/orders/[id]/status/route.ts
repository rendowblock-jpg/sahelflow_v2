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

    // FD-061 EX-3: CAPI stage triggers on the legacy transition path.
    // fireCapiStageForOrder only claims the durable ledger (no network
    // call — the drain does) and swallows its own failures, so a CAPI
    // failure can never block the transition; awaiting it keeps the
    // side-channel deterministic (no SQLite write-lock race with the
    // caller's next action).
    if (data.status === "confirmed" || data.status === "delivered") {
      await fireCapiStageForOrder(id, data.status);
    }

    return NextResponse.json({
      order: projectOrderForTrustedActor(actorContext, order),
    });
  },
  "PATCH /api/orders/[id]/status",
);
