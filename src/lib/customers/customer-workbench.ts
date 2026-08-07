import "server-only";

import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type {
  CustomerWorkbenchFieldAccess,
  CustomersWorkbenchResponse,
} from "@/types/workbench";

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
): CustomerWorkbenchFieldAccess {
  assertTrustedAction(actorContext, "customers.read", {
    shopId: actorContext.shop.shopId,
  });
  const contact = allowed(actorContext, "customers.contact.read");
  const financials = allowed(actorContext, "orders.financials.read");
  const manage = allowed(actorContext, "customers.manage");
  const contactUpdate = allowed(actorContext, "customers.contact.update");
  const risk =
    allowed(actorContext, "risk.read") &&
    contact &&
    financials;
  return Object.freeze({
    contact,
    financials,
    risk,
    manage,
    contactUpdate,
    import:
      allowed(actorContext, "data.import") &&
      manage &&
      contact &&
      contactUpdate,
    export: allowed(actorContext, "data.export") && contact,
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
        wilaya: access.contact,
        commune: access.contact,
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

  const rows = sourceRows as unknown as Array<{
    id: string;
    name?: string;
    phone?: string;
    wilaya?: string | null;
    commune?: string | null;
    riskScore?: number;
    isBlacklisted?: boolean;
    createdAt: Date;
  }>;
  const customerIds = rows.map((row) => row.id);
  const [countGroups, revenueGroups] = customerIds.length
    ? await Promise.all([
        db.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds }, deletedAt: null },
          _count: true,
        }),
        access.financials
          ? db.order.groupBy({
              by: ["customerId"],
              where: {
                customerId: { in: customerIds },
                status: { not: "cancelled" },
                deletedAt: null,
              },
              _sum: { totalPrice: true },
            })
          : Promise.resolve([]),
      ])
    : [[], []];

  const countMap = new Map(
    countGroups.map((group) => [group.customerId, group._count]),
  );
  const revenueMap = new Map(
    revenueGroups.map((group) => [
      group.customerId,
      group._sum.totalPrice ?? 0,
    ]),
  );

  return {
    customers: rows.map((row) => ({
      id: row.id,
      name: access.contact ? (row.name ?? null) : null,
      phone: access.contact ? (row.phone ?? null) : null,
      wilaya: access.contact ? (row.wilaya ?? null) : null,
      commune: access.contact ? (row.commune ?? null) : null,
      orderCount: countMap.get(row.id) ?? 0,
      totalSpent: access.financials ? (revenueMap.get(row.id) ?? 0) : null,
      riskScore: access.risk ? (row.riskScore ?? 0) : null,
      isBlacklisted: access.risk ? (row.isBlacklisted ?? false) : null,
      createdAt: row.createdAt,
    })),
    fieldAccess: access,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}

export async function getCustomerWorkbenchSummary(
  actorContext: TrustedActorContext,
): Promise<{
  total: number;
  active: number;
  atRisk: number | null;
  totalSpent: number | null;
}> {
  const access = resolveCustomerWorkbenchAccess(actorContext);
  const [total, active, atRisk, financial] = await Promise.all([
    db.customer.count({ where: { deletedAt: null } }),
    db.customer.count({
      where: { deletedAt: null, orderCount: { gt: 0 } },
    }),
    access.risk
      ? db.customer.count({
          where: { deletedAt: null, riskScore: { gte: 6 } },
        })
      : Promise.resolve(null),
    access.financials
      ? db.customer.aggregate({
          where: { deletedAt: null },
          _sum: { totalSpent: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    total,
    active,
    atRisk,
    totalSpent: access.financials
      ? (financial?._sum.totalSpent ?? 0)
      : null,
  };
}

export async function getCustomerWorkbenchDetail(
  actorContext: TrustedActorContext,
  id: string,
) {
  const access = resolveCustomerWorkbenchAccess(actorContext);
  const customer = await db.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: access.contact,
      phone: access.contact,
      phone2: access.contact,
      wilaya: access.contact,
      commune: access.contact,
      address: access.contact,
      notes: access.contact,
      riskScore: access.risk,
      isBlacklisted: access.risk,
      blacklistReason: access.risk,
      createdAt: true,
    },
  });
  if (!customer) return null;

  return {
    id: customer.id,
    name: access.contact ? customer.name : null,
    phone: access.contact ? customer.phone : null,
    phone2: access.contact ? customer.phone2 : null,
    wilaya: access.contact ? customer.wilaya : null,
    commune: access.contact ? customer.commune : null,
    address: access.contact ? customer.address : null,
    notes: access.contact ? customer.notes : null,
    riskScore: access.risk ? customer.riskScore : null,
    isBlacklisted: access.risk ? customer.isBlacklisted : null,
    blacklistReason: access.risk ? customer.blacklistReason : null,
    createdAt: customer.createdAt,
    fieldAccess: access,
    shop: shopContext.shopId,
  };
}
