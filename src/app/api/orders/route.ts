import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { scheduleAutomationOutbox } from "@/lib/business-truth/outbox-worker";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import { createTrustedManualOrder } from "@/lib/orders/manual-order";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { assessOrderRisk } from "@/lib/risk-engine";
import { orderStatusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const context = { prisma: db, shop: shopContext };

/** GET /api/orders — list orders with pagination (optional ?status= filter). */
export async function GET(req: NextRequest) {
  await requireAuth();
  scheduleAutomationOutbox(context, { limit: 20 });

  const searchParams = req.nextUrl.searchParams;
  const rawStatus = searchParams.get("status");
  const status = rawStatus && orderStatusSchema.safeParse(rawStatus).success
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

  const listOrders = orders.map((order) => ({
    ...order,
    mutationAuthority: isTrustedManualOrderAuthority(
      order.source,
      order.sourceMetadata,
    )
      ? "canonical_v1"
      : "legacy_compatibility",
  }));

  const hasNextPage = offset + orders.length < total;
  return NextResponse.json({
    orders: listOrders,
    total,
    hasNextPage,
    page,
    pageSize: limit,
  });
}

/** POST /api/orders — canonical trusted manual intake or compatibility intake. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();

  const effectiveSource = body?.source ?? "manual";
  const manualCommand = effectiveSource === "manual"
    ? await createTrustedManualOrder(context, { ...body, source: "manual" })
    : null;
  const manualResult = manualCommand?.result;
  const order = manualResult?.order ?? await orderService.create(context, body);

  if (manualCommand) {
    // The command freezes zero or more automation snapshots as separate intents.
    // Schedule a batch drain rather than assuming one legacy effect key.
    scheduleAutomationOutbox(context, { limit: 20 });
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
      order,
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
