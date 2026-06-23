/**
 * Product service extensions — search + performance stats.
 *
 * Product stats give the merchant insight into which products are
 * actually selling (units, revenue, order count) vs. just sitting in
 * the catalog — essential for inventory decisions.
 */
import "server-only";
import type { ServiceContext } from "../service-base";

export interface ProductStats {
  unitsSold: number;
  revenue: number;
  orderCount: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
}

export interface ProductListItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
  category: string | null;
  lowStockThreshold: number;
  images: string | null;
}

export const productServiceExtensions = {
  /**
   * Search products by name (case-insensitive, partial match).
   */
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number; activeOnly?: boolean },
  ): Promise<ProductListItem[]> {
    const q = query.trim();
    if (!q) return [];

    const rows = await ctx.prisma.product.findMany({
      where: {
        AND: [
          opts?.activeOnly ? { isActive: true } : {},
          { name: { contains: q } },
        ],
      },
      orderBy: { name: "asc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        isActive: true,
        category: true,
        lowStockThreshold: true,
        images: true,
      },
    });
    return rows as unknown as ProductListItem[];
  },

  /**
   * Get aggregated performance stats for a single product:
   * units sold, revenue, order count, and stock status.
   */
  async getStats(ctx: ServiceContext, productId: string): Promise<ProductStats> {
    const items = await ctx.prisma.orderItem.findMany({
      where: { productId },
      select: { quantity: true, total: true, orderId: true },
    });

    const unitsSold = items.reduce((sum, i) => sum + i.quantity, 0);
    const revenue = items.reduce((sum, i) => sum + i.total, 0);
    const orderCount = new Set(items.map((i) => i.orderId)).size;

    const product = await ctx.prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true, lowStockThreshold: true, isActive: true },
    });

    let stockStatus: ProductStats["stockStatus"] = "in_stock";
    if (product) {
      if (product.stock <= 0) stockStatus = "out_of_stock";
      else if (product.stock <= product.lowStockThreshold) stockStatus = "low_stock";
    }

    return { unitsSold, revenue, orderCount, stockStatus };
  },
};
