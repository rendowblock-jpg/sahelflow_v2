import "server-only";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type {
  ProductWorkbenchFieldAccess,
  ProductWorkbenchItem,
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

function parseImages(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function projectRow(
  row: {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    cost?: number | null;
    stock: number;
    lowStockThreshold: number;
    categoryId: string | null;
    images: string | null;
    isActive: boolean;
    createdAt: Date;
    productVariants: ProductWorkbenchItem["productVariants"];
  },
  access: ProductWorkbenchFieldAccess,
): ProductWorkbenchItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: row.price,
    cost: access.cost ? (row.cost ?? null) : null,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    categoryId: row.categoryId,
    images: parseImages(row.images),
    productVariants: row.productVariants,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
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
  const sourceRows = await db.product.findMany({
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
      images: true,
      isActive: true,
      createdAt: true,
      productVariants: {
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          stock: true,
          isActive: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.take,
    skip: opts.skip,
  });
  const rows = sourceRows as unknown as Parameters<typeof projectRow>[0][];
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
    products: rows.map((row) => projectRow(row, access)),
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
    products: rows.map((row) => projectRow(row, access)),
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
  const source = await db.product.findFirst({
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
      images: true,
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
  if (!source) return null;
  const product = source as unknown as {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    cost?: number | null;
    stock: number;
    lowStockThreshold: number;
    categoryId: string | null;
    images: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string } | null;
    productVariants: ProductWorkbenchItem["productVariants"];
  };
  return {
    ...product,
    cost: access.cost ? (product.cost ?? null) : null,
    images: parseImages(product.images),
    fieldAccess: access,
  };
}
