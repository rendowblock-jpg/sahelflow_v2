import "server-only";

import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import {
  isImportPendingOrderAuthority,
  isTrustedManualOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import { batchAssessOrders } from "@/lib/risk-engine/service";
import type { OrderStatus } from "@/types/domain";
import type {
  MutationAuthority,
  OrdersWorkbenchResponse,
  WorkbenchFieldAccess,
} from "@/types/workbench";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type OrdersWorkbenchSort =
  | "createdAt.desc"
  | "createdAt.asc"
  | "orderNumber.desc"
  | "orderNumber.asc"
  | "totalPrice.desc"
  | "totalPrice.asc";

export interface OrdersWorkbenchQuery {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
  sort?: string | null;
}

interface OrderListSourceRow {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice?: number;
  wilaya?: string;
  phone?: string;
  createdAt: Date;
  source: unknown;
  sourceMetadata: unknown;
  items: Array<{ id: string }>;
  customer?: { name: string | null; phone: string | null } | null;
}

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

export function resolveOrdersWorkbenchAccess(
  actorContext: TrustedActorContext,
): WorkbenchFieldAccess {
  assertTrustedAction(actorContext, "orders.read", {
    shopId: actorContext.shop.shopId,
  });
  return Object.freeze({
    contact: allowed(actorContext, "customers.contact.read"),
    financials: allowed(actorContext, "orders.financials.read"),
    risk: allowed(actorContext, "risk.read"),
    update: allowed(actorContext, "orders.update"),
  });
}

function clampPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(value!, MAX_PAGE_SIZE);
}

function normalizedSort(
  raw: string | null | undefined,
  canReadFinancials: boolean,
): OrdersWorkbenchSort {
  switch (raw) {
    case "createdAt.asc":
    case "createdAt.desc":
    case "orderNumber.asc":
    case "orderNumber.desc":
      return raw;
    case "totalPrice.asc":
    case "totalPrice.desc":
      return canReadFinancials ? raw : "createdAt.desc";
    default:
      return "createdAt.desc";
  }
}

function orderByFor(sort: OrdersWorkbenchSort) {
  const [field, direction] = sort.split(".") as [
    "createdAt" | "orderNumber" | "totalPrice",
    "asc" | "desc",
  ];
  if (field === "orderNumber") {
    return [{ orderNumber: direction }, { id: direction }] as const;
  }
  if (field === "totalPrice") {
    return [{ totalPrice: direction }, { id: direction }] as const;
  }
  return [{ createdAt: direction }, { id: direction }] as const;
}

function mutationAuthority(
  source: unknown,
  sourceMetadata: unknown,
): MutationAuthority {
  if (isTrustedManualOrderAuthority(source, sourceMetadata)) {
    return "canonical_v1";
  }
  if (isImportPendingOrderAuthority(source, sourceMetadata)) {
    return "confirmation_blocked";
  }
  return "legacy_compatibility";
}

/**
 * One permission-aware list contract shared by the RSC first paint and the
 * paginated API. Denied contact/financial fields are omitted from the Prisma
 * selection before protected values are opened; risk is emitted only when the
 * trusted actor has explicit risk.read authority. Every offset-paginated sort is
 * total and deterministic by appending the unique order id as a tie-breaker.
 */
export async function getOrdersWorkbenchPage(
  actorContext: TrustedActorContext,
  query: OrdersWorkbenchQuery = {},
): Promise<OrdersWorkbenchResponse> {
  const access = resolveOrdersWorkbenchAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const sort = normalizedSort(query.sort, access.financials);
  const where = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
  } as const;

  const [sourceRows, total] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalPrice: access.financials,
        wilaya: access.contact,
        phone: access.contact,
        createdAt: true,
        source: true,
        sourceMetadata: true,
        items: { select: { id: true } },
        customer: access.contact
          ? { select: { name: true, phone: true } }
          : false,
      },
      orderBy: orderByFor(sort),
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.order.count({ where }),
  ]);

  const rows = sourceRows as unknown as OrderListSourceRow[];
  const orders = rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    totalPrice: access.financials ? (row.totalPrice ?? null) : null,
    wilaya: access.contact ? (row.wilaya ?? null) : null,
    phone: access.contact ? (row.phone ?? null) : null,
    createdAt: row.createdAt,
    items: row.items,
    customer: access.contact
      ? {
          name: row.customer?.name ?? null,
          phone: row.customer?.phone ?? null,
        }
      : null,
    mutationAuthority: mutationAuthority(row.source, row.sourceMetadata),
  }));

  let riskData: OrdersWorkbenchResponse["riskData"];
  if (access.risk && rows.length > 0) {
    const assessments = await batchAssessOrders(
      { prisma: db, shop: shopContext },
      rows.map((row) => row.id),
    );
    riskData = Object.fromEntries(
      [...assessments.entries()].map(([orderId, assessment]) => [
        orderId,
        { level: assessment.level, score: assessment.score },
      ]),
    );
  }

  return {
    orders,
    ...(riskData ? { riskData } : {}),
    fieldAccess: access,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
    sort,
  };
}
