import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { fireCapiStageForOrder } from "@/lib/meta/capi-triggers";

export const dynamic = "force-dynamic";

const context = { prisma: db, shop: shopContext };

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireTrustedAction("orders.update");
    const { id } = await params;
    const body = await req.json();
    const command = await executeCanonicalFulfillment(context, {
      ...body,
      orderId: id,
    });

    // FD-061 EX-3: fire-and-forget CAPI delivered-stage trigger — a CAPI
    // failure can never block the delivery confirmation.
    if (!command.replayed && command.result.status === "delivered") {
      void fireCapiStageForOrder(id, "delivered", "delivered");
    }

    return NextResponse.json({
      order: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/fulfillment",
);
