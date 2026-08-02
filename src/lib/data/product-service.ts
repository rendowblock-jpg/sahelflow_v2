/**
 * Product service — CRUD + stock management + low-stock detection.
 */
import { detectLowStock, dispatchLowStock } from "@/lib/automations/engine";
import type { OrderChangeTransactionClient } from "@/lib/data/order-change-service";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";
import {
  createCategorySchema,
  createProductSchema,
  updateProductSchema,
} from "@/lib/validation";
import type { Category, Product } from "@/types/domain";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";

function toDomainProduct(row: Record<string, unknown>): Product {
  const output = { ...row };
  // Legacy: variants was a JSON string. Keep parsing for backward compatibility,
  // but the canonical source is now the ProductVariant relation.
  if (typeof output.variants === "string") {
    try {
      output.variants = JSON.parse(output.variants);
    } catch {
      output.variants = null;
    }
  }
  if (typeof output.images === "string") {
    try {
      output.images = JSON.parse(output.images);
    } catch {
      output.images = null;
    }
  }
  return output as unknown as Product;
}

function toDomainCategory(row: Record<string, unknown>): Category {
  return row as unknown as Category;
}

async function assertCanonicalCatalogMutationAllowed(
  tx: OrderChangeTransactionClient,
  productId: string,
): Promise<void> {
  const activeReservations = await tx.$queryRaw<Array<{ present: number }>>`
    SELECT 1 AS "present"
    FROM "InventoryReservation"
    WHERE "productId" = ${productId}
      AND "state" = 'active'
    LIMIT 1
  `;
  if (activeReservations.length > 0) {
    throw new SahelFlowError(
      "Product or variant stock is governed by an active reservation",
      "CANONICAL_STOCK_ADJUSTMENT_REQUIRED",
      409,
    );
  }

  // A pending canonical order has already selected this exact catalog identity
  // and price. Block stock, activation and variant-shape changes until the order
  // is confirmed or rejected, regardless of whether intake was manual,
  // storefront, WhatsApp, import, provider or AI.
  const pendingSelections = await tx.orderItem.findMany({
    where: {
      productId,
      order: {
        status: "pending",
        deletedAt: null,
      },
    },
    select: {
      order: {
        select: {
          source: true,
          sourceMetadata: true,
        },
      },
    },
  });
  if (
    pendingSelections.some(({ order }) =>
      isCanonicalOrderAuthority(order.source, order.sourceMetadata),
    )
  ) {
    throw new SahelFlowError(
      "Product or variant authority is selected by a pending canonical order",
      "CANONICAL_CATALOG_MUTATION_BLOCKED",
      409,
    );
  }
}

export const productService = {
  async list(
    context: ServiceContext,
    options?: { limit?: number; offset?: number; activeOnly?: boolean },
  ): Promise<Product[]> {
    const rows = await context.prisma.product.findMany({
      where: options?.activeOnly
        ? { isActive: true, deletedAt: null }
        : { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return rows.map((row) =>
      toDomainProduct(row as unknown as Record<string, unknown>),
    );
  },

  async getById(context: ServiceContext, id: string): Promise<Product> {
    return withServiceError(async () => {
      const row = await context.prisma.product.findFirst({
        where: { id, deletedAt: null },
        include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      });
      if (!row) throw new NotFoundError("Product", id);
      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async create(context: ServiceContext, input: unknown): Promise<Product> {
    return withServiceError(async () => {
      const data = createProductSchema.parse(input);
      const { variants: legacyVariants, ...productData } = data;

      if (data.sku) {
        const existing = await context.prisma.product.findFirst({
          where: { sku: data.sku, deletedAt: null },
        });
        if (existing) {
          throw new ConflictError(`Product with SKU ${data.sku} already exists`);
        }
      }

      const variantRows =
        Array.isArray(legacyVariants) && legacyVariants.length > 0
          ? legacyVariants.map((variant, index) => ({
              name: variant.name,
              sku: variant.sku ?? null,
              price: variant.price ?? null,
              stock: variant.stock ?? 0,
              isActive: variant.isActive ?? true,
              sortOrder: variant.sortOrder ?? index,
            }))
          : [
              {
                name: "Default",
                sku: data.sku ?? null,
                price: data.price,
                stock: data.stock,
                isActive: true,
                sortOrder: 0,
              },
            ];

      const row = await context.prisma.product.create({
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

  async update(
    context: ServiceContext,
    id: string,
    input: unknown,
  ): Promise<Product> {
    return withServiceError(async () => {
      const data = updateProductSchema.parse(input);
      const { variants: legacyVariants, ...productData } = data;

      if (data.sku) {
        const conflict = await context.prisma.product.findFirst({
          where: { sku: data.sku, deletedAt: null, id: { not: id } },
        });
        if (conflict && conflict.id !== id) {
          throw new ConflictError(`SKU ${data.sku} already used by another product`);
        }
      }

      const lowStockToDispatch: Array<{
        id: string;
        name: string;
        sku: string | null;
        stock: number;
        lowStockThreshold: number;
      }> = [];
      const row = await context.prisma.$transaction(async (tx) => {
        if (
          data.stock !== undefined ||
          data.isActive === false ||
          Array.isArray(legacyVariants)
        ) {
          await assertCanonicalCatalogMutationAllowed(tx, id);
        }

        if (Array.isArray(legacyVariants)) {
          const existing = await tx.productVariant.findMany({
            where: { productId: id },
          });
          const incomingIds = legacyVariants
            .filter((variant) => variant.id)
            .map((variant) => variant.id);
          const ownedVariantIds = new Set(
            existing.map((variant) => variant.id),
          );
          const foreignVariantId = incomingIds.find(
            (variantId) => variantId && !ownedVariantIds.has(variantId),
          );
          if (foreignVariantId) {
            throw new ValidationError(
              `Variant '${foreignVariantId}' does not belong to product '${id}'`,
              "variants.id",
            );
          }
          const toDelete = existing
            .filter((variant) => !incomingIds.includes(variant.id))
            .map((variant) => variant.id);

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
              return variant.id
                ? tx.productVariant.update({
                    where: { id: variant.id },
                    data: payload,
                  })
                : tx.productVariant.create({
                    data: { ...payload, productId: id },
                  });
            }),
          ]);
        }

        const updated = await tx.product.update({
          where: { id },
          data: {
            ...productData,
            variants:
              legacyVariants !== undefined
                ? legacyVariants
                  ? JSON.stringify(legacyVariants)
                  : null
                : undefined,
            images:
              data.images !== undefined
                ? data.images
                  ? JSON.stringify(data.images)
                  : null
                : undefined,
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
        void dispatchLowStock(context, product);
      }

      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async delete(context: ServiceContext, id: string): Promise<void> {
    return withServiceError(async () => {
      await context.prisma.$transaction(async (tx) => {
        await assertCanonicalCatalogMutationAllowed(tx, id);
        await tx.product.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
      });
    }, "Product");
  },

  /** Deduct stock (called when order is confirmed). */
  async deductStock(
    context: ServiceContext,
    productId: string,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new ValidationError("Quantity must be positive", "quantity");
    }
    await context.prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  },

  /** Restore stock (called when order is cancelled/returned/refused). */
  async restoreStock(
    context: ServiceContext,
    productId: string,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new ValidationError("Quantity must be positive", "quantity");
    }
    await context.prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });
  },

  /** List products at or below their low-stock threshold. */
  async listLowStock(context: ServiceContext): Promise<Product[]> {
    const rows = await context.prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        stock: { lte: context.prisma.product.fields.lowStockThreshold },
      },
      orderBy: { stock: "asc" },
    });
    return rows.map((row) =>
      toDomainProduct(row as unknown as Record<string, unknown>),
    );
  },

  // ─── Categories ─────────────────────────────────────────────────────────────

  async listCategories(context: ServiceContext): Promise<Category[]> {
    const rows = await context.prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map((row) =>
      toDomainCategory(row as unknown as Record<string, unknown>),
    );
  },

  async createCategory(
    context: ServiceContext,
    input: unknown,
  ): Promise<Category> {
    return withServiceError(async () => {
      const data = createCategorySchema.parse(input);
      const existing = await context.prisma.category.findUnique({
        where: { name: data.name },
      });
      if (existing) {
        throw new ConflictError(`Category ${data.name} already exists`);
      }
      const row = await context.prisma.category.create({ data });
      return toDomainCategory(row as unknown as Record<string, unknown>);
    }, "Category");
  },
};
