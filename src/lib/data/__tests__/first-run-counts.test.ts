import { describe, expect, it, vi } from "vitest";

import { getFirstRunCounts } from "@/lib/data/first-run-counts";

function fakePrisma(n: { orders: number; products: number; customers: number }) {
  return {
    order: { count: vi.fn().mockResolvedValue(n.orders) },
    product: { count: vi.fn().mockResolvedValue(n.products) },
    customer: { count: vi.fn().mockResolvedValue(n.customers) },
  };
}

describe("getFirstRunCounts", () => {
  it("counts live (not soft-deleted) orders, products and customers", async () => {
    const prisma = fakePrisma({ orders: 0, products: 2, customers: 5 });
    const out = await getFirstRunCounts(prisma, { orders: true, products: true, customers: true });
    expect(out).toEqual({ orders: 0, products: 2, customers: 5 });
    expect(prisma.order.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(prisma.product.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(prisma.customer.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it("does not query, and reports null, for a table the actor may not read", async () => {
    const prisma = fakePrisma({ orders: 9, products: 9, customers: 9 });
    const out = await getFirstRunCounts(prisma, { orders: false, products: true, customers: false });
    expect(out).toEqual({ orders: null, products: 9, customers: null });
    expect(prisma.order.count).not.toHaveBeenCalled();
    expect(prisma.customer.count).not.toHaveBeenCalled();
  });
});
