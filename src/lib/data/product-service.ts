/**
 * Product service — CRUD + stock management + low-stock detection.
 */
import type { Product, Category } from "@/types/domain";
import { NotFoundError, ConflictError, ValidationError } from "@/types/errors";
import { createProductSchema, updateProductSchema, createCategorySchema } from "@/lib/validation";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";

function toDomainProduct(row: Record<string, unknown>): Product {
  const r = { ...row };
  // Legacy: variants was a JSON string. Keep parsing for backward compat,
  // but the canonical source is now the ProductVariant relation.
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

export const productService = {
  async list(ctx: ServiceContext, opts?: { limit?: number; offset?: number; activeOnly?: boolean }): Promise<Product[]> {
    const rows = await ctx.prisma.product.findMany({
      where: opts?.activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: "desc" },
      include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows.map((r) => toDomainProduct(r as unknown as Record<string, unknown>));
  },

  async getById(ctx: ServiceContext, id: string): Promise<Product> {
    return withServiceError(async () => {
      const row = await ctx.prisma.product.findUnique({
        where: { id },
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

      // Check SKU uniqueness if provided
      if (data.sku) {
        const existing = await ctx.prisma.product.findUnique({ where: { sku: data.sku } });
        if (existing) {
          throw new ConflictError(`Product with SKU ${data.sku} already exists`);
        }
      }

      // Build variant rows: use the new variants array (from the form), or
      // fall back to a single "Default" variant with the product's stock.
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

      if (data.sku) {
        const conflict = await ctx.prisma.product.findUnique({ where: { sku: data.sku } });
        if (conflict && conflict.id !== id) {
          throw new ConflictError(`SKU ${data.sku} already used by another product`);
        }
      }

      // If variants array is provided, sync ProductVariant rows:
      // - variants with an id → update
      // - variants without an id → create
      // - existing rows not in the array → delete
      if (Array.isArray(legacyVariants)) {
        const existing = await ctx.prisma.productVariant.findMany({ where: { productId: id } });
        const incomingIds = legacyVariants.filter(v => v.id).map(v => v.id);
        const toDelete = existing.filter(e => !incomingIds.includes(e.id)).map(e => e.id);

        await Promise.all([
          // Delete removed variants
          ...toDelete.map(variantId =>
            ctx.prisma.productVariant.delete({ where: { id: variantId } })
          ),
          // Upsert kept/new variants
          ...legacyVariants.map((v, i) => {
            const payload = {
              name: v.name,
              sku: v.sku ?? null,
              price: v.price ?? null,
              stock: v.stock ?? 0,
              isActive: v.isActive ?? true,
              sortOrder: v.sortOrder ?? i,
            };
            if (v.id) {
              return ctx.prisma.productVariant.update({ where: { id: v.id }, data: payload });
            }
            return ctx.prisma.productVariant.create({
              data: { ...payload, productId: id },
            });
          }),
        ]);
      }

      const row = await ctx.prisma.product.update({
        where: { id },
        data: {
          ...productData,
          variants: legacyVariants !== undefined ? (legacyVariants ? JSON.stringify(legacyVariants) : null) : undefined,
          images: data.images !== undefined ? (data.images ? JSON.stringify(data.images) : null) : undefined,
        },
        include: { productVariants: { orderBy: { sortOrder: "asc" } } },
      });
      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async delete(ctx: ServiceContext, id: string): Promise<void> {
    return withServiceError(async () => {
      // Check for order items referencing this product
      const orderItemCount = await ctx.prisma.orderItem.count({ where: { productId: id } });
      if (orderItemCount > 0) {
        // Soft-delete instead of hard-delete
        await ctx.prisma.product.update({ where: { id }, data: { isActive: false } });
        return;
      }
      await ctx.prisma.product.delete({ where: { id } });
    }, "Product");
  },

  /** Deduct stock (called when order is confirmed). */
  async deductStock(ctx: ServiceContext, productId: string, quantity: number): Promise<void> {
    if (quantity <= 0) throw new ValidationError("Quantity must be positive", "quantity");
    await ctx.prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  },

  /** Restore stock (called when order is cancelled/returned/refused). */
  async restoreStock(ctx: ServiceContext, productId: string, quantity: number): Promise<void> {
    if (quantity <= 0) throw new ValidationError("Quantity must be positive", "quantity");
    await ctx.prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });
  },

  /** List products at or below their low-stock threshold. */
  async listLowStock(ctx: ServiceContext): Promise<Product[]> {
    const rows = await ctx.prisma.product.findMany({
      where: { isActive: true, stock: { lte: ctx.prisma.product.fields.lowStockThreshold } },
      orderBy: { stock: "asc" },
    });
    return rows.map((r) => toDomainProduct(r as unknown as Record<string, unknown>));
  },

  // ─── Categories ─────────────────────────────────────────────────────────────

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
