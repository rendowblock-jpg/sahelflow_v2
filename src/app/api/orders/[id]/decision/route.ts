import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { runManualDecisionEffects } from "@/lib/orders/decide-order-for-actor";

export const dynamic = "force-dynamic";

const context = { prisma: db, shop: shopContext };

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireTrustedAction("orders.update");
    const { id } = await params;
    const body = await req.json();
    const command = await executeManualOrderDecision(context, {
      ...body,
      orderId: id,
    });

    // The trigger, stock.low and CAPI effects are shared with the phone.
    await runManualDecisionEffects(context, command);

    return NextResponse.json({
      order: {
        id: command.result.orderId,
        orderNumber: command.result.orderNumber,
        status: command.result.status,
        version: command.result.version,
        confirmedAt: command.result.confirmedAt,
      },
      rejectionReason: command.result.rejectionReason,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "POST /api/orders/[id]/decision",
);
