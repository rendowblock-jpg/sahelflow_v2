import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  dispatchTrigger,
  type TriggerEvent,
} from "@/lib/automations/engine";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { fireCapiStageForOrder } from "@/lib/meta/capi-triggers";

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
      await dispatchTrigger(
        context,
        trigger,
        command.result.automation.order,
        {
          triggerKey: `${trigger}:${command.result.orderId}:v${command.result.version}`,
        },
      );
      for (const product of command.result.automation.lowStock) {
        await dispatchTrigger(
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
        );
      }
      // FD-061 EX-3: CAPI confirmed-stage trigger. fireCapiStageForOrder
      // only claims the durable ledger (no network call — the drain does)
      // and swallows its own failures, so a CAPI failure can never block
      // the confirmation decision; awaiting it keeps the side-channel
      // deterministic so the buyer's next action never races this write
      // for SQLite's write lock.
      if (command.result.status === "confirmed") {
        await fireCapiStageForOrder(command.result.orderId, "confirmed");
      }
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
