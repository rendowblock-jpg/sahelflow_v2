/**
 * Product service — CRUD + stock management + low-stock detection.
 */
import type { Product, Category } from "@/types/domain";
import { NotFoundError, ConflictError, ValidationError } from "@/types/errors";
import { createProductSchema, updateProductSchema, createCategorySchema } from "@/lib/validation";
import { TRUSTED_MANUAL_ORDER_AUTHORITY } from "@/lib/orders/manual-order-authority";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";
import { detectLowStock, dispatchLowStock } from "@/lib/automations/engine";

function toDomainProduct(row: Record<string, unknown>): Product {
  const r = { ...row };
  if (typeof r.variants === "string") {
    try { r.variants = JSON.parse(r.variants as string); } catch { r.variants = null; }
  }
  if (typeof r.images === "string") {
    try { r.images = JSON.parse(r.images as string); } catch { r.images = null; }
  }
  return r as unknown as Product;
}

function toDomainCategory(row: Record<string, unknown>): Category {
  return row as unknown as Category;
}

function assertNonNegativeStock(
  productStock: number | undefined,
  variants: Array<{ stock?: number | null }> | null | undefined,
): void {
  if (productStock !== undefined && productStock < 0) {
    throw new ValidationError("Product stock cannot be negative", "stock");
  }
  if (variants?.some((variant) => (variant.stock ?? 0) < 0)) {
    throw new ValidationError("Variant stock cannot be negative", "variants.stock");
  }
}

async function assertNoActiveReservation(
  tx: ServiceContext["prisma"],
  productId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ orderId: string; productVariantId: string | null }>>`
    SELECT "orderId", "productVariantId"
    FROM "InventoryReservation"
    WHERE "productId" = ${productId}
      AND "state" = 'active'
    LIMIT 1
  `;
  if (rows.length > 0) {
    throw new ConflictError(
      `Product '${productId}' has active canonical reservations and its stock, variants or lifecycle cannot be edited`,
    );
  }
}

async function pendingTrustedProductReference(
  tx: ServiceContext["prisma"],
  productId: string,
): Promise<{ orderId: string } | null> {
  return tx.orderItem.findFirst({
    where: {
      productId,
      order: {
        status: "pending",
        deletedAt: null,
        source: "manual",
        sourceMetadata: { contains: TRUSTED_MANUAL_ORDER_AUTHORITY },
      },
    },
    select: { orderId: true },
  });
}

async function assertNoPendingTrustedProductReference(
  tx: ServiceContext["prisma"],
  productId: string,
  operation: string,
): Promise<void> {
  const reference = await pendingTrustedProductReference(tx, productId);
  if (reference) {
    throw new ConflictError(
      `Product '${productId}' cannot be ${operation}; pending trusted order '${reference.orderId}' already selected it`,
    );
  }
}

async function assertNoPendingTrustedVariantReference(
  tx: ServiceContext["prisma"],
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0) return;
  const reference = await tx.orderItem.findFirst({
    where: {
      productVariantId: { in: variantIds },
      order: {
        status: "pending",
        deletedAt: null,
        source: "manual",
        sourceMetadata: { contains: TRUSTED_MANUAL_ORDER_AUTHORITY },
      },
    },
    select: { orderId: true, productVariantId: true },
  });
  if (reference) {
    throw new ConflictError(
      `Variant '${reference.productVariantId}' is selected by pending trusted order '${reference.orderId}'`,
    );
  }
}

export const productService = {
  async list(ctx: ServiceContext, opts?: { limit?: number; offset?: number; activeOnly?: boolean }): Promise<Product[]> {
    const rows = await ctx.prisma.product.findMany({
      where: opts?.activeOnly ? { isActive: true, deletedAt: null } : { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows.map((r) => toDomainProduct(r as unknown as Record<string, unknown>));
  },

  async getById(ctx: ServiceContext, id: string): Promise<Product> {
    return withServiceError(async () => {
      const row = await ctx.prisma.product.findFirst({
        where: { id, deletedAt: null },
        include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      });
      if (!row) throw new NotFoundError("Product", id);
      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async create(ctx: ServiceContext, input: unknown): Promise<Product> {
    return withServiceError(async () => {
      const data = createProductSchema.parse(input);
      const { variants: legacyVariants, ...productData } = data;
      assertNonNegativeStock(data.stock, legacyVariants);

      if (data.sku) {
        const existing = await ctx.prisma.product.findFirst({ where: { sku: data.sku, deletedAt: null } });
        if (existing) {
          throw new ConflictError(`Product with SKU ${data.sku} already exists`);
        }
      }

      const variantRows = Array.isArray(legacyVariants) && legacyVariants.length > 0
        ? legacyVariants.map((v, i) => ({
            name: v.name,
            sku: v.sku ?? null,
            price: v.price ?? null,
            stock: v.stock ?? 0,
            isActive: v.isActive ?? true,
            sortOrder: v.sortOrder ?? i,
          }))
        : [{
            name: "Default",
            sku: data.sku ?? null,
            price: data.price,
            stock: data.stock,
            isActive: true,
            sortOrder: 0,
          }];

      const row = await ctx.prisma.product.create({
        data: {
          ...productData,
          variants: legacyVariants ? JSON.stringify(legacyVariants) : null,
          images: data.images ? JSON.stringify(data.images) : null,
          productVariants: { create: variantRows },
        },
        include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      });
      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Product> {
    return withServiceError(async () => {
      const data = updateProductSchema.parse(input);
      const { variants: legacyVariants, ...productData } = data;
      assertNonNegativeStock(data.stock, legacyVariants);

      if (data.sku) {
        const conflict = await ctx.prisma.product.findFirst({ where: { sku: data.sku, deletedAt: null, id: { not: id } } });
        if (conflict && conflict.id !== id) {
          throw new ConflictError(`SKU ${data.sku} already used by another product`);
        }
      }

      const lowStockToDispatch: Array<{ id: string; name: string; sku: string | null; stock: number; lowStockThreshold: number }> = [];
      const row = await ctx.prisma.$transaction(async (tx) => {
        const existingProduct = await tx.product.findFirst({
          where: { id, deletedAt: null },
          include: { productVariants: true },
        });
        if (!existingProduct) throw new NotFoundError("Product", id);

        const authorityMutation =
          data.stock !== undefined ||
          Array.isArray(legacyVariants) ||
          data.isActive === false;
        if (authorityMutation) {
          await assertNoActiveReservation(tx as ServiceContext["prisma"], id);
        }
        if (data.isActive === false) {
          await assertNoPendingTrustedProductReference(
            tx as ServiceContext["prisma"],
            id,
            "deactivated",
          );
        }

        if (Array.isArray(legacyVariants)) {
          const existing = existingProduct.productVariants;
          const incomingIds = legacyVariants
            .filter((variant) => variant.id)
            .map((variant) => variant.id!);
          const toDelete = existing
            .filter((variant) => !incomingIds.includes(variant.id))
            .map((variant) => variant.id);
          const toDeactivate = legacyVariants
            .filter((variant) => variant.id && variant.isActive === false)
            .map((variant) => variant.id!);
          await assertNoPendingTrustedVariantReference(
            tx as ServiceContext["prisma"],
            [...new Set([...toDelete, ...toDeactivate])],
          );

          await Promise.all([
            ...toDelete.map((variantId) =>
              tx.productVariant.delete({ where: { id: variantId } }),
            ),
            ...legacyVariants.map((variant, index) => {
              const payload = {
                name: variant.name,
                sku: variant.sku ?? null,
                price: variant.price ?? null,
                stock: variant.stock ?? 0,
                isActive: variant.isActive ?? true,
                sortOrder: variant.sortOrder ?? index,
              };
              if (variant.id) {
                return tx.productVariant.update({
                  where: { id: variant.id },
                  data: payload,
                });
              }
              return tx.productVariant.create({
                data: { ...payload, productId: id },
              });
            }),
          ]);
        }

        const updated = await tx.product.update({
          where: { id },
          data: {
            ...productData,
            variants: legacyVariants !== undefined ? (legacyVariants ? JSON.stringify(legacyVariants) : null) : undefined,
            images: data.images !== undefined ? (data.images ? JSON.stringify(data.images) : null) : undefined,
          },
          include: { productVariants: { orderBy: { sortOrder: "asc" } } },
        });

        if (data.stock !== undefined) {
          const lowStockInfo = await detectLowStock(tx, id);
          if (lowStockInfo) lowStockToDispatch.push(lowStockInfo);
        }

        return updated;
      });

      for (const product of lowStockToDispatch) {
        void dispatchLowStock(ctx, product);
      }

      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async delete(ctx: ServiceContext, id: string): Promise<void> {
    return withServiceError(async () => {
      await ctx.prisma.$transaction(async (tx) => {
        await assertNoActiveReservation(tx as ServiceContext["prisma"], id);
        await assertNoPendingTrustedProductReference(
          tx as ServiceContext["prisma"],
          id,
          "deleted",
        );
        await tx.product.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
      });
    }, "Product");
  },

  async deductStock(ctx: ServiceContext, productId: string, quantity: number): Promise<void> {
    if (quantity <= 0) throw new ValidationError("Quantity must be positive", "quantity");
    await assertNoActiveReservation(ctx.prisma, productId);
    const updated = await ctx.prisma.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (updated.count !== 1) throw new ConflictError("Insufficient product stock");
  },

  async restoreStock(ctx: ServiceContext, productId: string, quantity: number): Promise<void> {
    if (quantity <= 0) throw new ValidationError("Quantity must be positive", "quantity");
    await assertNoActiveReservation(ctx.prisma, productId);
    await ctx.prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });
  },

  async listLowStock(ctx: ServiceContext): Promise<Product[]> {
    const rows = await ctx.prisma.product.findMany({
      where: { isActive: true, deletedAt: null, stock: { lte: ctx.prisma.product.fields.lowStockThreshold } },
      orderBy: { stock: "asc" },
    });
    return rows.map((r) => toDomainProduct(r as unknown as Record<string, unknown>));
  },

  async listCategories(ctx: ServiceContext): Promise<Category[]> {
    const rows = await ctx.prisma.category.findMany({ orderBy: { name: "asc" } });
    return rows.map((r) => toDomainCategory(r as unknown as Record<string, unknown>));
  },

  async createCategory(ctx: ServiceContext, input: unknown): Promise<Category> {
    return withServiceError(async () => {
      const data = createCategorySchema.parse(input);
      const existing = await ctx.prisma.category.findUnique({ where: { name: data.name } });
      if (existing) throw new ConflictError(`Category ${data.name} already exists`);
      const row = await ctx.prisma.category.create({ data });
      return toDomainCategory(row as unknown as Record<string, unknown>);
    }, "Category");
  },
};
