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
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
    return rows.map((r) => toDomainProduct(r as unknown as Record<string, unknown>));
  },

  async getById(ctx: ServiceContext, id: string): Promise<Product> {
    return withServiceError(async () => {
      const row = await ctx.prisma.product.findUnique({ where: { id } });
      if (!row) throw new NotFoundError("Product", id);
      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async create(ctx: ServiceContext, input: unknown): Promise<Product> {
    return withServiceError(async () => {
      const data = createProductSchema.parse(input);

      // Check SKU uniqueness if provided
      if (data.sku) {
        const existing = await ctx.prisma.product.findUnique({ where: { sku: data.sku } });
        if (existing) {
          throw new ConflictError(`Product with SKU ${data.sku} already exists`);
        }
      }

      const row = await ctx.prisma.product.create({
        data: {
          ...data,
          variants: data.variants ? JSON.stringify(data.variants) : null,
          images: data.images ? JSON.stringify(data.images) : null,
        },
      });
      return toDomainProduct(row as unknown as Record<string, unknown>);
    }, "Product");
  },

  async update(ctx: ServiceContext, id: string, input: unknown): Promise<Product> {
    return withServiceError(async () => {
      const data = updateProductSchema.parse(input);

      if (data.sku) {
        const conflict = await ctx.prisma.product.findUnique({ where: { sku: data.sku } });
        if (conflict && conflict.id !== id) {
          throw new ConflictError(`SKU ${data.sku} already used by another product`);
        }
      }

      const row = await ctx.prisma.product.update({
        where: { id },
        data: {
          ...data,
          variants: data.variants !== undefined ? (data.variants ? JSON.stringify(data.variants) : null) : undefined,
          images: data.images !== undefined ? (data.images ? JSON.stringify(data.images) : null) : undefined,
        },
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
