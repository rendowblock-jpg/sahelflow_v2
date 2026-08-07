import "server-only";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type {
  ProductWorkbenchFieldAccess,
  ProductsWorkbenchResponse,
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

export function resolveProductWorkbenchAccess(
  actorContext: TrustedActorContext,
): ProductWorkbenchFieldAccess {
  assertTrustedAction(actorContext, "products.read", {
    shopId: actorContext.shop.shopId,
  });
  const cost = allowed(actorContext, "products.cost.read");
  const manage = allowed(actorContext, "products.manage");
  const costUpdate = allowed(actorContext, "products.cost.update");
  return Object.freeze({
    cost,
    manage,
    costUpdate,
    import:
      allowed(actorContext, "data.import") &&
      manage &&
      cost &&
      costUpdate,
    export: allowed(actorContext, "data.export") && cost,
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

async function queryProducts(
  actorContext: TrustedActorContext,
  opts: { take: number; skip: number; activeOnly?: boolean },
) {
  const access = resolveProductWorkbenchAccess(actorContext);
  const where = {
    deletedAt: null,
    ...(opts.activeOnly ? { isActive: true } : {}),
  } as const;
  const rows = await db.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      cost: access.cost,
      stock: true,
      lowStockThreshold: true,
      categoryId: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.take,
    skip: opts.skip,
  });
  return { access, rows, where };
}

export async function getProductsWorkbenchPage(
  actorContext: TrustedActorContext,
  query: { page?: number; pageSize?: number; activeOnly?: boolean } = {},
): Promise<ProductsWorkbenchResponse> {
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const { access, rows, where } = await queryProducts(actorContext, {
    take: pageSize,
    skip: (page - 1) * pageSize,
    activeOnly: query.activeOnly,
  });
  const total = await db.product.count({ where });

  return {
    products: rows.map((row) => ({
      ...row,
      cost: access.cost ? row.cost : null,
    })),
    fieldAccess: access,
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
  };
}

export async function getProductsWorkbenchSlice(
  actorContext: TrustedActorContext,
  query: { limit?: number; offset?: number; activeOnly?: boolean } = {},
) {
  const limit = clampPageSize(query.limit);
  const offset = Number.isSafeInteger(query.offset) && (query.offset ?? 0) > 0
    ? query.offset!
    : 0;
  const { access, rows } = await queryProducts(actorContext, {
    take: limit,
    skip: offset,
    activeOnly: query.activeOnly,
  });
  return {
    products: rows.map((row) => ({
      ...row,
      cost: access.cost ? row.cost : null,
    })),
    fieldAccess: access,
  };
}

export async function getProductWorkbenchSummary(
  actorContext: TrustedActorContext,
) {
  const access = resolveProductWorkbenchAccess(actorContext);
  const [total, active, lowStockRows, inventoryRows] = await Promise.all([
    db.product.count({ where: { deletedAt: null } }),
    db.product.count({ where: { deletedAt: null, isActive: true } }),
    db.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { stock: true, lowStockThreshold: true },
    }),
    db.product.findMany({
      where: { deletedAt: null },
      select: { price: true, stock: true },
    }),
  ]);
  return {
    fieldAccess: access,
    total,
    active,
    lowStock: lowStockRows.filter(
      (row) => row.stock <= row.lowStockThreshold,
    ).length,
    inventoryValue: inventoryRows.reduce(
      (sum, row) => sum + row.price * Math.max(0, row.stock),
      0,
    ),
  };
}

export async function getProductWorkbenchDetail(
  actorContext: TrustedActorContext,
  id: string,
) {
  const access = resolveProductWorkbenchAccess(actorContext);
  const product = await db.product.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      cost: access.cost,
      stock: true,
      lowStockThreshold: true,
      categoryId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      productVariants: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          stock: true,
          isActive: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!product) return null;
  return {
    ...product,
    cost: access.cost ? product.cost : null,
    fieldAccess: access,
  };
}
