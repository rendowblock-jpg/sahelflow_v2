import "server-only";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type {
  CustomerWorkbenchAccess,
  CustomerWorkbenchDetail,
  CustomerWorkbenchItem,
  CustomerWorkbenchSummary,
  CustomersWorkbenchResponse,
} from "@/types/workbench";
import { NotFoundError } from "@/types/errors";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

export function resolveCustomerWorkbenchAccess(
  actorContext: TrustedActorContext,
): CustomerWorkbenchAccess {
  assertTrustedAction(actorContext, "customers.read", {
    shopId: actorContext.shop.shopId,
  });
  const contact = allowed(actorContext, "customers.contact.read");
  const financials = allowed(actorContext, "orders.financials.read");
  const risk = allowed(actorContext, "risk.read");
  const manage = allowed(actorContext, "customers.manage");
  const contactUpdate = allowed(actorContext, "customers.contact.update");
  return Object.freeze({
    contact,
    financials,
    risk,
    manage,
    contactUpdate,
    export: allowed(actorContext, "data.export") && contact && financials,
    import:
      allowed(actorContext, "data.import") &&
      manage &&
      contact &&
      contactUpdate,
  });
}

function clampPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(value!, MAX_PAGE_SIZE);
}

function toListItem(
  row: Record<string, unknown>,
  access: CustomerWorkbenchAccess,
  exact?: { orderCount?: number; totalSpent?: number | null },
): CustomerWorkbenchItem {
  return {
    id: String(row.id),
    name: access.contact ? String(row.name ?? "") : null,
    phone: access.contact ? String(row.phone ?? "") : null,
    wilaya: access.contact ? ((row.wilaya as string | null) ?? null) : null,
    commune: access.contact ? ((row.commune as string | null) ?? null) : null,
    orderCount: exact?.orderCount ?? Number(row.orderCount ?? 0),
    totalSpent: access.financials
      ? (exact?.totalSpent ?? Number(row.totalSpent ?? 0))
      : null,
    riskScore: access.risk ? Number(row.riskScore ?? 0) : null,
    isBlacklisted: access.risk ? Boolean(row.isBlacklisted) : null,
    createdAt: row.createdAt as Date,
  };
}

export async function getCustomersWorkbenchPage(
  actorContext: TrustedActorContext,
  query: { page?: number; pageSize?: number } = {},
): Promise<CustomersWorkbenchResponse> {
  const access = resolveCustomerWorkbenchAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const where = { deletedAt: null } as const;

  const [sourceRows, total] = await Promise.all([
    db.customer.findMany({
      where,
      select: {
        id: true,
        name: access.contact,
        phone: access.contact,
        phoneEnc: access.contact,
        wilaya: access.contact,
        commune: access.contact,
        orderCount: true,
        totalSpent: access.financials,
        riskScore: access.risk,
        isBlacklisted: access.risk,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.customer.count({ where }),
  ]);

  const rawRows = sourceRows as unknown as Record<string, unknown>[];
  const customerIds = rawRows.map((row) => String(row.id));
  const [orderCounts, financialSums] = customerIds.length > 0
    ? await Promise.all([
        db.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds }, deletedAt: null },
          _count: { _all: true },
        }),
        access.financials
          ? db.order.groupBy({
              by: ["customerId"],
              where: {
                customerId: { in: customerIds },
                deletedAt: null,
                status: { notIn: ["cancelled", "draft"] },
              },
              _sum: { totalPrice: true },
            })
          : Promise.resolve([]),
      ])
    : [[], []];
  const countMap = new Map(
    orderCounts.map((row) => [row.customerId, row._count._all]),
  );
  const spendMap = new Map(
    financialSums.map((row) => [row.customerId, row._sum.totalPrice ?? 0]),
  );

  return {
    customers: rawRows.map((row) => {
      const id = String(row.id);
      return toListItem(row, access, {
        orderCount: countMap.get(id) ?? 0,
        totalSpent: access.financials ? (spendMap.get(id) ?? 0) : null,
      });
    }),
    fieldAccess: access,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}

export async function getCustomerWorkbenchSummary(
  actorContext: TrustedActorContext,
): Promise<CustomerWorkbenchSummary> {
  const access = resolveCustomerWorkbenchAccess(actorContext);
  const [totalCustomers, activeCustomerGroups, spent, atRisk] = await Promise.all([
    db.customer.count({ where: { deletedAt: null } }),
    db.order.groupBy({
      by: ["customerId"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    access.financials
      ? db.order.aggregate({
          where: {
            deletedAt: null,
            status: { notIn: ["cancelled", "draft"] },
          },
          _sum: { totalPrice: true },
        })
      : Promise.resolve(null),
    access.risk
      ? db.customer.count({ where: { deletedAt: null, riskScore: { gte: 6 } } })
      : Promise.resolve(null),
  ]);
  return {
    totalCustomers,
    activeCustomers: activeCustomerGroups.length,
    totalSpent: access.financials ? (spent?._sum.totalPrice ?? 0) : null,
    atRiskCustomers: atRisk,
  };
}

export async function getCustomerWorkbenchDetail(
  actorContext: TrustedActorContext,
  customerId: string,
): Promise<CustomerWorkbenchDetail> {
  const access = resolveCustomerWorkbenchAccess(actorContext);
  const orders = allowed(actorContext, "orders.read");
  const orderFinancials = orders && access.financials;
  const riskManage = allowed(actorContext, "risk.manage");

  const source = await db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: {
      id: true,
      name: access.contact,
      phone: access.contact,
      phoneEnc: access.contact,
      phone2: access.contact,
      wilaya: access.contact,
      commune: access.contact,
      address: access.contact,
      notes: access.contact,
      orderCount: true,
      totalSpent: access.financials,
      riskScore: access.risk,
      isBlacklisted: access.risk,
      blacklistReason: access.risk,
      createdAt: true,
    },
  });
  if (!source) throw new NotFoundError("Customer", customerId);
  const raw = source as unknown as Record<string, unknown>;

  const [statusGroups, dates, recentOrders, financialAggregate] = orders
    ? await Promise.all([
        db.order.groupBy({
          by: ["status"],
          where: { customerId, deletedAt: null },
          _count: { _all: true },
        }),
        db.order.aggregate({
          where: { customerId, deletedAt: null },
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
        db.order.findMany({
          where: { customerId, deletedAt: null },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalPrice: orderFinancials,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        }),
        orderFinancials
          ? db.order.aggregate({
              where: {
                customerId,
                deletedAt: null,
                status: { notIn: ["cancelled", "draft"] },
              },
              _sum: { totalPrice: true },
            })
          : Promise.resolve(null),
      ])
    : [[], null, [], null];

  const counts = new Map(
    statusGroups.map((row) => [row.status, row._count._all]),
  );
  const totalOrders = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const deliveredCount = counts.get("delivered") ?? 0;
  const returnedCount = (counts.get("returned") ?? 0) + (counts.get("refused") ?? 0);
  const totalSpent = orderFinancials
    ? (financialAggregate?._sum.totalPrice ?? 0)
    : null;
  const listItem = toListItem(raw, access, {
    orderCount: totalOrders,
    totalSpent,
  });

  return {
    customer: {
      ...listItem,
      phone2: access.contact ? ((raw.phone2 as string | null) ?? null) : null,
      address: access.contact ? ((raw.address as string | null) ?? null) : null,
      notes: access.contact ? ((raw.notes as string | null) ?? null) : null,
      blacklistReason: access.risk
        ? ((raw.blacklistReason as string | null) ?? null)
        : null,
    },
    stats: orders
      ? {
          totalOrders,
          totalSpent,
          deliveredCount,
          returnedCount,
          deliveryRate:
            totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0,
          avgOrderValue:
            totalSpent !== null && totalOrders > 0
              ? Math.round(totalSpent / totalOrders)
              : null,
          firstOrderDate: dates?._min.createdAt ?? null,
          lastOrderDate: dates?._max.createdAt ?? null,
        }
      : null,
    orders: (recentOrders as unknown as Array<Record<string, unknown>>).map((order) => ({
      id: String(order.id),
      orderNumber: String(order.orderNumber),
      status: String(order.status),
      totalPrice: orderFinancials ? Number(order.totalPrice ?? 0) : null,
      createdAt: order.createdAt as Date,
    })),
    fieldAccess: Object.freeze({
      ...access,
      orders,
      orderFinancials,
      riskManage,
    }),
  };
}
