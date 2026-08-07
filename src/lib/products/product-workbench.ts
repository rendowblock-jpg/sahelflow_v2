import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type {
  ProductWorkbenchAccess,
  ProductWorkbenchDetail,
  ProductWorkbenchItem,
  ProductWorkbenchSummary,
  ProductsWorkbenchResponse,
} from "@/types/workbench";
import { NotFoundError } from "@/types/errors";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type ProductWorkbenchSort =
  | "createdAt.desc"
  | "createdAt.asc"
  | "price.desc"
  | "price.asc"
  | "stock.desc"
  | "stock.asc";

interface LegacyVariantSourceRow {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyProductSourceRow {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  cost?: number | null;
  stock: number;
  lowStockThreshold: number;
  categoryId: string | null;
  images: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  productVariants: LegacyVariantSourceRow[];
}

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
): ProductWorkbenchAccess {
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
    export: allowed(actorContext, "data.export") && cost,
    import: allowed(actorContext, "data.import") && manage && cost && costUpdate,
  });
}

function clampPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(value!, MAX_PAGE_SIZE);
}

function normalizeSort(raw: string | null | undefined): ProductWorkbenchSort {
  switch (raw) {
    case "createdAt.asc":
    case "createdAt.desc":
    case "price.asc":
    case "price.desc":
    case "stock.asc":
    case "stock.desc":
      return raw;
    default:
      return "createdAt.desc";
  }
}

function orderByFor(
  sort: ProductWorkbenchSort,
): Prisma.ProductOrderByWithRelationInput[] {
  const [field, direction] = sort.split(".") as [
    "createdAt" | "price" | "stock",
    "asc" | "desc",
  ];
  return [
    { [field]: direction },
    { id: direction },
  ] as Prisma.ProductOrderByWithRelationInput[];
}

function parseImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function toProduct(
  row: Record<string, unknown>,
  access: ProductWorkbenchAccess,
): ProductWorkbenchItem {
  const category = row.category as { name?: string | null } | null | undefined;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sku: (row.sku as string | null) ?? null,
    price: Number(row.price ?? 0),
    cost: access.cost ? (row.cost == null ? null : Number(row.cost)) : null,
    stock: Number(row.stock ?? 0),
    lowStockThreshold: Number(row.lowStockThreshold ?? 0),
    categoryId: (row.categoryId as string | null) ?? null,
    categoryName: category?.name ?? null,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt as Date,
  };
}

export async function getProductsWorkbenchPage(
  actorContext: TrustedActorContext,
  query: {
    page?: number;
    pageSize?: number;
    offset?: number;
    activeOnly?: boolean;
    sort?: string | null;
  } = {},
): Promise<ProductsWorkbenchResponse> {
  const access = resolveProductWorkbenchAccess(actorContext);
  const pageSize = clampPageSize(query.pageSize);
  const page = query.offset != null
    ? Math.floor(Math.max(0, query.offset) / pageSize) + 1
    : clampPage(query.page);
  const offset = query.offset != null
    ? Math.max(0, query.offset)
    : (page - 1) * pageSize;
  const sort = normalizeSort(query.sort);
  const where = query.activeOnly
    ? { isActive: true, deletedAt: null }
    : { deletedAt: null };

  const [sourceRows, total] = await Promise.all([
    db.product.findMany({
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
        category: { select: { name: true } },
        isActive: true,
        createdAt: true,
      },
      orderBy: orderByFor(sort),
      take: pageSize,
      skip: offset,
    }),
    db.product.count({ where }),
  ]);

  return {
    products: (sourceRows as unknown as Record<string, unknown>[]).map((row) =>
      toProduct(row, access),
    ),
    fieldAccess: access,
    total,
    hasNextPage: offset + sourceRows.length < total,
    page,
    pageSize,
    sort,
  };
}

/**
 * Preserve the historical non-page `/api/products` picker contract without
 * reintroducing permission-after-read. Cost is selected only when authorized;
 * variants/images and the legacy `variants` property remain available to
 * existing order/forms and integration callers.
 */
export async function getLegacyProductsList(
  actorContext: TrustedActorContext,
  query: { limit?: number; offset?: number; activeOnly?: boolean } = {},
) {
  const access = resolveProductWorkbenchAccess(actorContext);
  const limit = Math.min(Math.max(1, query.limit ?? 50), MAX_PAGE_SIZE);
  const offset = Math.max(0, query.offset ?? 0);
  const rows = await db.product.findMany({
    where: query.activeOnly
      ? { isActive: true, deletedAt: null }
      : { deletedAt: null },
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
      productVariants: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          productId: true,
          name: true,
          sku: true,
          price: true,
          stock: true,
          isActive: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    skip: offset,
  });
  const sourceRows = rows as unknown as LegacyProductSourceRow[];
  return sourceRows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: row.price,
    cost: access.cost ? (row.cost ?? null) : null,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    categoryId: row.categoryId,
    variants: row.productVariants,
    images: parseImages(row.images),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fieldAccess: Object.freeze({ cost: access.cost }),
  }));
}

export async function getProductWorkbenchSummary(
  actorContext: TrustedActorContext,
): Promise<ProductWorkbenchSummary> {
  resolveProductWorkbenchAccess(actorContext);
  const [totalProducts, activeProducts, lowStockRows, inventoryRows] = await Promise.all([
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
    totalProducts,
    activeProducts,
    lowStockProducts: lowStockRows.filter(
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
  productId: string,
): Promise<ProductWorkbenchDetail> {
  const access = resolveProductWorkbenchAccess(actorContext);
  const orders = allowed(actorContext, "orders.read");
  const orderFinancials = orders && allowed(actorContext, "orders.financials.read");
  const source = await db.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      cost: access.cost,
      stock: true,
      lowStockThreshold: true,
      categoryId: true,
      category: { select: { name: true } },
      images: true,
      isActive: true,
      createdAt: true,
      productVariants: {
        orderBy: { sortOrder: "asc" },
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
  if (!source) throw new NotFoundError("Product", productId);

  const recentItems = orders
    ? await db.orderItem.findMany({
        where: { productId, order: { deletedAt: null } },
        select: {
          id: true,
          quantity: true,
          unitPrice: orderFinancials,
          total: orderFinancials,
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ order: { createdAt: "desc" } }, { id: "desc" }],
        take: 20,
      })
    : [];
  const raw = source as unknown as Record<string, unknown>;
  return {
    product: {
      ...toProduct(raw, access),
      images: parseImages(raw.images),
      productVariants: source.productVariants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,
        isActive: variant.isActive,
        sortOrder: variant.sortOrder,
      })),
    },
    recentOrders: recentItems.map((item) => ({
      id: item.id,
      orderId: item.order.id,
      orderNumber: item.order.orderNumber,
      status: item.order.status,
      quantity: item.quantity,
      unitPrice: orderFinancials ? item.unitPrice : null,
      total: orderFinancials ? item.total : null,
      createdAt: item.order.createdAt,
    })),
    fieldAccess: Object.freeze({ ...access, orders, orderFinancials }),
  };
}
