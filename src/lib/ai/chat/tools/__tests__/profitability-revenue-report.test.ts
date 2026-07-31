import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import "@/lib/ai/chat/tools/advanced-tools";
import { getTool, type ToolContext } from "../registry";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  TEST_SHOP_CONTEXT,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

function ctx(): ToolContext {
  return { db, shop: TEST_SHOP_CONTEXT };
}

describe("governed get_revenue_report", () => {
  it("reports realized delivery revenue without counting pending order value", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const deliveredAt = new Date();
    await db.order.createMany({
      data: [
        {
          orderNumber: "ORD-AI-REALIZED",
          status: "delivered",
          customerId: customer.id,
          totalPrice: 5000,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "123 Rue",
          phone: uniquePhone(),
          source: "manual",
          deliveredAt,
        },
        {
          orderNumber: "ORD-AI-PENDING",
          status: "pending",
          customerId: customer.id,
          totalPrice: 9000,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "123 Rue",
          phone: uniquePhone(),
          source: "manual",
        },
      ],
    });

    const result = await getTool("get_revenue_report")!.execute(
      { period: "today" },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      period: "Aujourd'hui",
      orderCount: 1,
      revenue: 5000,
      realizedRevenue: 5000,
      netRevenue: 5000,
      netProfit: 5000,
      averageOrderValue: 5000,
    });
  });

  it("uses today and returns zeroes when no delivery revenue exists", async () => {
    const result = await getTool("get_revenue_report")!.execute({}, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      period: "Aujourd'hui",
      orderCount: 0,
      revenue: 0,
      realizedRevenue: 0,
      netRevenue: 0,
      netProfit: 0,
      averageOrderValue: 0,
    });
  });
});
