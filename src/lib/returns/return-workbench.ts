import "server-only";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface ReturnWorkbenchAccess {
  contact: boolean;
  financials: boolean;
  manage: boolean;
  create: boolean;
  export: boolean;
}

export interface ReturnWorkbenchItem {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  type: string;
  notes: string | null;
  createdAt: Date | string;
  order: {
    id: string;
    orderNumber: string;
    customer: { name: string | null } | null;
  };
}

export interface ReturnWorkbenchResponse {
  returns: ReturnWorkbenchItem[];
  fieldAccess: ReturnWorkbenchAccess;
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

export function resolveReturnWorkbenchAccess(
  actorContext: TrustedActorContext,
): ReturnWorkbenchAccess {
  assertTrustedAction(actorContext, "orders.read", {
    shopId: actorContext.shop.shopId,
  });
  const contact = allowed(actorContext, "customers.contact.read");
  const financials = allowed(actorContext, "orders.financials.read");
  const manage = allowed(actorContext, "orders.update");
  return Object.freeze({
    contact,
    financials,
    manage,
    create: manage && contact,
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

export async function getReturnWorkbenchPage(
  actorContext: TrustedActorContext,
  query: { page?: number; pageSize?: number } = {},
): Promise<ReturnWorkbenchResponse> {
  const access = resolveReturnWorkbenchAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const where = { deletedAt: null } as const;
  const [sourceRows, total] = await Promise.all([
    db.return.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        reason: true,
        status: true,
        type: true,
        notes: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: access.contact
              ? { select: { name: true } }
              : false,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.return.count({ where }),
  ]);
  const rows = sourceRows as unknown as Array<{
    id: string;
    orderId: string;
    reason: string;
    status: string;
    type: string;
    notes: string | null;
    createdAt: Date;
    order: {
      id: string;
      orderNumber: string;
      customer?: { name: string } | null;
    };
  }>;

  return {
    returns: rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      reason: row.reason,
      status: row.status,
      type: row.type,
      notes: row.notes,
      createdAt: row.createdAt,
      order: {
        id: row.order.id,
        orderNumber: row.order.orderNumber,
        customer:
          access.contact && row.order.customer
            ? { name: row.order.customer.name }
            : null,
      },
    })),
    fieldAccess: access,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}
