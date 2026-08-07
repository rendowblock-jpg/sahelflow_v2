import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db, shopContext } from "@/lib/db";
import { deliveryService } from "@/lib/data/delivery-service";
import type { DeliveryStatus } from "@/types/domain";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { trustedActionAllowed } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const PENDING_DELIVERY_STATUSES = ["pending", "created"] as const satisfies readonly DeliveryStatus[];

/**
 * GET /api/delivery — list deliveries with pagination + optional status filter.
 *
 * The seller-facing `status=pending` bucket intentionally includes both
 * provider-pending and newly-created delivery rows; Dashboard attention and the
 * Deliveries workbench therefore resolve to the same operational population.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("deliveries.read");
  const contact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
  );
  const financials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
  );
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(parseInt(sp.get("pageSize") ?? "25", 10) || 25, 100);
  const status = sp.get("status");
  const offset = (page - 1) * pageSize;

  const include = {
    order: { include: { customer: { select: { name: true, phone: true } } } },
  } satisfies Prisma.DeliveryInclude;
  type DeliveryWithOrder = Prisma.DeliveryGetPayload<{
    include: typeof include;
  }>;

  const listStatus: DeliveryStatus | readonly DeliveryStatus[] | undefined =
    status === "pending"
      ? PENDING_DELIVERY_STATUSES
      : status && status !== "all"
        ? (status as DeliveryStatus)
        : undefined;
  const statusFilter =
    typeof listStatus === "string"
      ? { status: listStatus }
      : listStatus
        ? { status: { in: [...listStatus] } }
        : {};

  const [deliveries, total] = await Promise.all([
    deliveryService.list(
      { prisma: db, shop: shopContext },
      {
        limit: pageSize,
        offset,
        ...(listStatus ? { status: listStatus } : {}),
        include,
      },
    ) as Promise<DeliveryWithOrder[]>,
    db.delivery.count({ where: { deletedAt: null, ...statusFilter } }),
  ]);

  const hasNextPage = offset + deliveries.length < total;
  const projectedDeliveries = deliveries.map((delivery) => ({
    ...delivery,
    cost: financials ? delivery.cost : null,
    order: delivery.order
      ? {
          ...delivery.order,
          phone: contact ? delivery.order.phone : null,
          address: contact ? delivery.order.address : null,
          notes: contact ? delivery.order.notes : null,
          sourceMetadata: contact ? delivery.order.sourceMetadata : null,
          totalPrice: financials ? delivery.order.totalPrice : null,
          deliveryCost: financials ? delivery.order.deliveryCost : null,
          customer: delivery.order.customer
            ? {
                ...delivery.order.customer,
                name: contact ? delivery.order.customer.name : null,
                phone: contact ? delivery.order.customer.phone : null,
              }
            : null,
        }
      : null,
    fieldAccess: { contact, financials },
  }));
  return NextResponse.json({
    deliveries: projectedDeliveries,
    total,
    hasNextPage,
    page,
    pageSize,
  });
}, "GET /api/delivery");
