import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  dispatchTrigger,
  type TriggerEvent,
} from "@/lib/automations/engine";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";

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

    if (!command.replayed) {
      const trigger = command.result.automation.trigger as TriggerEvent;
      await Promise.all([
        dispatchTrigger(
          context,
          trigger,
          command.result.automation.order,
          {
            triggerKey: `${trigger}:${command.result.orderId}:v${command.result.version}`,
          },
        ),
        ...command.result.automation.lowStock.map((product) =>
          dispatchTrigger(
            context,
            "stock.low" as TriggerEvent,
            {
              productId: product.id,
              productName: product.name,
              stockLevel: product.stock,
              lowStockThreshold: product.lowStockThreshold,
            },
            {
              triggerKey: `stock.low:${product.id}:order:${command.result.orderId}:v${command.result.version}`,
            },
          ),
        ),
      ]);
    }

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
