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
import { projectOrderForTrustedActor } from "@/lib/identity/order-projection";
import { createTrustedManualOrder } from "@/lib/orders/manual-order";
import { getOrdersWorkbenchPage } from "@/lib/orders/order-list-workbench";
import { assessOrderRisk } from "@/lib/risk-engine";
import { orderStatusSchema } from "@/lib/validation";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const context = { prisma: db, shop: shopContext };

/**
 * GET /api/orders — the canonical Phase 5 operational list contract.
 *
 * Pagination, sort, permission filtering, protected-field selection, mutation
 * authority and optional risk projection are resolved by the same server helper
 * used for the RSC first paint, so later pages cannot silently lose customer or
 * risk truth.
 */
export async function GET(req: NextRequest) {
  const actorContext = await requireTrustedAction("orders.read");
  const searchParams = req.nextUrl.searchParams;
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus && orderStatusSchema.safeParse(rawStatus).success
      ? (rawStatus as OrderStatus)
      : undefined;
  const risk = searchParams.get("risk") === "high" ? "high" : undefined;

  const result = await getOrdersWorkbenchPage(actorContext, {
    status,
    risk,
    page: Number.parseInt(searchParams.get("page") ?? "1", 10),
    pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
    sort: searchParams.get("sort"),
  });

  return NextResponse.json(result);
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
    await dispatchTrigger(
      context,
      "order.created" as TriggerEvent,
      manualResult.automation,
      {
        triggerKey: `order.created:${manualResult.order.id}`,
        occurredAt: manualResult.order.createdAt,
      },
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
