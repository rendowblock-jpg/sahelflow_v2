import "server-only";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { DeliveryStatus } from "@/types/domain";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PENDING_STATUSES = ["pending", "created"] as const satisfies readonly DeliveryStatus[];

export interface DeliveryWorkbenchAccess {
  contact: boolean;
  financials: boolean;
  manage: boolean;
  export: boolean;
}

export interface DeliveryWorkbenchItem {
  id: string;
  orderId: string;
  provider: string;
  trackingNumber: string | null;
  cost: number | null;
  status: string;
  estimatedDelivery: Date | string | null;
  createdAt: Date | string;
  order: {
    id: string;
    orderNumber: string;
    wilaya: string | null;
    customer: { name: string | null; phone: string | null } | null;
  } | null;
}

export interface DeliveryWorkbenchResponse {
  deliveries: DeliveryWorkbenchItem[];
  fieldAccess: DeliveryWorkbenchAccess;
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
) {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

export function resolveDeliveryWorkbenchAccess(
  actorContext: TrustedActorContext,
): DeliveryWorkbenchAccess {
  assertTrustedAction(actorContext, "deliveries.read", {
    shopId: actorContext.shop.shopId,
  });
  const contact = allowed(actorContext, "customers.contact.read");
  const financials = allowed(actorContext, "orders.financials.read");
  const manage =
    allowed(actorContext, "deliveries.manage") &&
    allowed(actorContext, "orders.read") &&
    allowed(actorContext, "orders.update");
  return Object.freeze({
    contact,
    financials,
    manage,
    export: allowed(actorContext, "data.export") && contact && financials,
  });
}

function clampPage(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined) {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(value!, MAX_PAGE_SIZE);
}

function statusWhere(status: string | undefined) {
  if (status === "pending") return { status: { in: [...PENDING_STATUSES] } };
  if (status && status !== "all") return { status };
  return {};
}

function deliverySearchWhere(q: string | undefined) {
  const value = q?.trim();
  if (!value) return {};
  // Deliberately search only non-PII operational identifiers here. Customer PII
  // remains behind its purpose-specific protected search authority.
  return {
    OR: [
      { trackingNumber: { contains: value } },
      { provider: { contains: value } },
      { order: { orderNumber: { contains: value } } },
    ],
  };
}

export async function getDeliveryWorkbenchPage(
  actorContext: TrustedActorContext,
  query: { page?: number; pageSize?: number; status?: string; q?: string } = {},
): Promise<DeliveryWorkbenchResponse> {
  const access = resolveDeliveryWorkbenchAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const where = {
    deletedAt: null,
    ...statusWhere(query.status),
    ...deliverySearchWhere(query.q),
  };
  const [sourceRows, total] = await Promise.all([
    db.delivery.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        provider: true,
        trackingNumber: true,
        cost: access.financials,
        status: true,
        estimatedDelivery: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            wilaya: access.contact,
            customer: access.contact
              ? { select: { name: true, phone: true } }
              : false,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.delivery.count({ where }),
  ]);
  const rows = sourceRows as unknown as Array<{
    id: string;
    orderId: string;
    provider: string;
    trackingNumber: string | null;
    cost?: number | null;
    status: string;
    estimatedDelivery: Date | null;
    createdAt: Date;
    order: {
      id: string;
      orderNumber: string;
      wilaya?: string | null;
      customer?: { name: string; phone: string } | null;
    } | null;
  }>;

  return {
    deliveries: rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      provider: row.provider,
      trackingNumber: row.trackingNumber,
      cost: access.financials ? (row.cost ?? null) : null,
      status: row.status,
      estimatedDelivery: row.estimatedDelivery,
      createdAt: row.createdAt,
      order: row.order
        ? {
            id: row.order.id,
            orderNumber: row.order.orderNumber,
            wilaya: access.contact ? (row.order.wilaya ?? null) : null,
            customer:
              access.contact && row.order.customer
                ? {
                    name: row.order.customer.name,
                    phone: row.order.customer.phone,
                  }
                : null,
          }
        : null,
    })),
    fieldAccess: access,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}
