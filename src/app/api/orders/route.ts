import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  dispatchTrigger,
  type TriggerEvent,
} from "@/lib/automations/engine";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { assertOrderCreateFieldAuthority } from "@/lib/identity/order-authorization";
import {
  projectOrderForTrustedActor,
  projectOrdersForTrustedActor,
} from "@/lib/identity/order-projection";
import { createTrustedManualOrder } from "@/lib/orders/manual-order";
import {
  isImportPendingOrderAuthority,
  isTrustedManualOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import { assessOrderRisk } from "@/lib/risk-engine";
import { orderStatusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const context = { prisma: db, shop: shopContext };

/** GET /api/orders — permission-filtered list with pagination. */
export async function GET(req: NextRequest) {
  const actorContext = await requireTrustedAction("orders.read");
  const searchParams = req.nextUrl.searchParams;
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus && orderStatusSchema.safeParse(rawStatus).success
      ? rawStatus
      : undefined;

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
  const limit = Math.min(pageSize, 100);
  const offset = (page - 1) * limit;
  const statusFilter = status as
    | "draft"
    | "pending"
    | "confirmed"
    | "shipped"
    | "delivered"
    | "returned"
    | "refused"
    | "cancelled"
    | undefined;

  const [orders, total] = await Promise.all([
    orderService.list(context, { status: statusFilter, limit, offset }),
    db.order.count({
      where: {
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
  ]);

  const projected = projectOrdersForTrustedActor(actorContext, orders);
  const listOrders = projected.map((order, index) => {
    const sourceOrder = orders[index];
    if (!sourceOrder) return order;
    return {
      ...order,
      mutationAuthority: isTrustedManualOrderAuthority(
        sourceOrder.source,
        sourceOrder.sourceMetadata,
      )
        ? "canonical_v1"
        : isImportPendingOrderAuthority(
              sourceOrder.source,
              sourceOrder.sourceMetadata,
            )
          ? "confirmation_blocked"
          : "legacy_compatibility",
    };
  });
  const hasNextPage = offset + orders.length < total;

  return NextResponse.json({
    orders: listOrders,
    total,
    hasNextPage,
    page,
    pageSize: limit,
  });
}

/** POST /api/orders — governed manual intake or compatibility intake. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("orders.create");
  assertTrustedAction(actorContext, "orders.read", {
    shopId: actorContext.shop.shopId,
  });
  assertOrderCreateFieldAuthority(actorContext);
  const businessContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const body = await req.json();
  const effectiveSource = body?.source ?? "manual";
  const manualCommand =
    effectiveSource === "manual"
      ? await createTrustedManualOrder(businessContext, {
          ...body,
          source: "manual",
        })
      : null;
  const manualResult = manualCommand?.result;
  const order =
    manualResult?.order ?? (await orderService.create(context, body));

  if (manualCommand && !manualCommand.replayed && manualResult) {
    void dispatchTrigger(
      context,
      "order.created" as TriggerEvent,
      manualResult.automation,
    );
  }

  let risk: Awaited<ReturnType<typeof assessOrderRisk>> = null;
  if (!manualCommand?.replayed) {
    try {
      risk = await assessOrderRisk(context, order.id);
    } catch {
      // Risk assessment is advisory and may be recomputed on demand.
    }
  }

  return NextResponse.json(
    {
      order: projectOrderForTrustedActor(actorContext, order),
      risk,
      customerCreated: manualResult?.customerCreated ?? false,
      authority: manualCommand ? "trusted-manual-v1" : "legacy-compatibility",
      command: manualCommand
        ? {
            id: manualCommand.commandId,
            aggregateVersion: manualCommand.aggregateVersion,
            replayed: manualCommand.replayed,
          }
        : null,
    },
    { status: 201 },
  );
}, "POST /api/orders");
