/**
 * Extended AI chat tools tests — 12 tools registered in extended-tools.ts.
 *
 * Covers: get_order_details, list_recent_orders, get_customer_details,
 * get_low_stock_products, get_revenue_report, get_delivery_status,
 * search_conversations, get_pending_deliveries, get_top_products,
 * update_product_stock, cancel_order, get_wilaya_risk.
 *
 * The wilaya-risk engine is mocked (it depends on the global `db` singleton
 * from @/lib/db, which we don't want to wire up in unit tests).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Mock the wilaya-risk engine — `assessOrderRisk` reads from the global db
// singleton, which we don't initialize in these tests.
vi.mock("@/lib/wilaya-risk/engine", () => ({
  assessOrderRisk: vi.fn().mockResolvedValue({
    level: 2,
    label: "Faible",
    recommendation: "Confirmation standard",
  }),
}));

import "@/lib/ai/chat/tools/extended-tools"; // side-effect: registers 12 tools
import { getTool, type ToolContext } from "../registry";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
  seedCategory,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
  // cleanDb (in createTestPrisma) doesn't clean these tables — do it explicitly
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.wilayaRiskProfile.deleteMany();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

function ctx(): ToolContext {
  return { db };
}

// ── get_order_details ────────────────────────────────────────────────────────

describe("get_order_details", () => {
  it("fetches an order by orderNumber with items + customer", async () => {
    const customer = await seedCustomer(db, { name: "Amine", phone: uniquePhone() });
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { name: "Widget", categoryId: cat.id });
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id,
        totalPrice: 5000, wilaya: "Alger", commune: "Bab Ezzouar",
        address: "123", phone: "0551234567", source: "manual",
        items: {
          create: [{ productId: product.id, productName: "Widget", quantity: 2, unitPrice: 2500, total: 5000 }],
        },
      },
    });

    const tool = getTool("get_order_details")!;
    const result = await tool.execute({ orderNumber: "ORD-0001" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { orderNumber: string; status: string; items: unknown[]; customer: { name: string } };
    expect(data.orderNumber).toBe("ORD-0001");
    expect(data.status).toBe("confirmed");
    expect(data.items).toHaveLength(1);
    expect(data.customer.name).toBe("Amine");
  });

  it("fetches an order by orderId", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual",
      },
    });

    const tool = getTool("get_order_details")!;
    const result = await tool.execute({ orderId: order.id }, ctx());

    expect(result.success).toBe(true);
    expect((result.data as { id: string }).id).toBe(order.id);
  });

  it("returns error when order is not found", async () => {
    const tool = getTool("get_order_details")!;
    const result = await tool.execute({ orderNumber: "ORD-9999" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("introuvable");
  });

  it("returns error when neither orderNumber nor orderId is provided", async () => {
    const tool = getTool("get_order_details")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });
});

// ── list_recent_orders ───────────────────────────────────────────────────────

describe("list_recent_orders", () => {
  it("returns recent orders ordered by createdAt desc", async () => {
    const customer = await seedCustomer(db, { name: "First", phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "confirmed", customerId: customer.id, totalPrice: 2000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("list_recent_orders")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ orderNumber: string }>;
    expect(data).toHaveLength(2);
    expect(data[0]!.orderNumber).toBe("ORD-0002");
  });

  it("filters by status", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "confirmed", customerId: customer.id, totalPrice: 2000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("list_recent_orders")!;
    const result = await tool.execute({ status: "confirmed" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ orderNumber: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.orderNumber).toBe("ORD-0002");
  });

  it("returns empty array when no orders exist", async () => {
    const tool = getTool("list_recent_orders")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

// ── get_customer_details ─────────────────────────────────────────────────────

describe("get_customer_details", () => {
  it("returns customer profile + order history", async () => {
    const customer = await seedCustomer(db, { name: "Lina", phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 3000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("get_customer_details")!;
    const result = await tool.execute({ customerId: customer.id }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { name: string; orders: unknown[] };
    expect(data.name).toBe("Lina");
    expect(data.orders).toHaveLength(1);
  });

  it("returns error for a non-existent customer", async () => {
    const tool = getTool("get_customer_details")!;
    const result = await tool.execute({ customerId: "cnonexistent123456789" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("introuvable");
  });
});

// ── get_low_stock_products ───────────────────────────────────────────────────

describe("get_low_stock_products", () => {
  it("returns active products at or below the threshold", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Low", stock: 3, lowStockThreshold: 5, categoryId: cat.id });
    await seedProduct(db, { name: "Empty", stock: 0, lowStockThreshold: 5, categoryId: cat.id });
    await seedProduct(db, { name: "OK", stock: 50, lowStockThreshold: 5, categoryId: cat.id });

    const tool = getTool("get_low_stock_products")!;
    const result = await tool.execute({ threshold: 5 }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string }>;
    expect(data).toHaveLength(2);
    expect(data.map((p) => p.name).sort()).toEqual(["Empty", "Low"]);
  });

  it("returns empty array when all products are above threshold", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Plenty", stock: 100, categoryId: cat.id });

    const tool = getTool("get_low_stock_products")!;
    const result = await tool.execute({ threshold: 5 }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

// ── get_revenue_report ───────────────────────────────────────────────────────

describe("get_revenue_report", () => {
  it("returns revenue + order count for today", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 5000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    // Cancelled order — excluded from revenue
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "cancelled", customerId: customer.id, totalPrice: 9999, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("get_revenue_report")!;
    const result = await tool.execute({ period: "today" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { revenue: number; orderCount: number; averageOrderValue: number };
    expect(data.revenue).toBe(5000);
    expect(data.orderCount).toBe(1); // cancelled excluded
    expect(data.averageOrderValue).toBe(5000);
  });

  it("returns zero revenue on an empty database", async () => {
    const tool = getTool("get_revenue_report")!;
    const result = await tool.execute({ period: "week" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { revenue: number; orderCount: number };
    expect(data.revenue).toBe(0);
    expect(data.orderCount).toBe(0);
  });

  it("uses 'today' as default period", async () => {
    const tool = getTool("get_revenue_report")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { period: string };
    expect(data.period).toBe("Aujourd'hui");
  });
});

// ── get_delivery_status ──────────────────────────────────────────────────────

describe("get_delivery_status", () => {
  it("returns delivery info when a delivery exists for the order", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const order = await db.order.create({
      data: { orderNumber: "ORD-0001", status: "shipped", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.delivery.create({
      data: { orderId: order.id, provider: "yalidine", trackingNumber: "TRK-001", cost: 600, status: "in_transit" },
    });

    const tool = getTool("get_delivery_status")!;
    const result = await tool.execute({ orderNumber: "ORD-0001" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { hasDelivery: boolean; provider: string; trackingNumber: string };
    expect(data.hasDelivery).toBe(true);
    expect(data.provider).toBe("yalidine");
    expect(data.trackingNumber).toBe("TRK-001");
  });

  it("reports hasDelivery=false when order has no delivery", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("get_delivery_status")!;
    const result = await tool.execute({ orderNumber: "ORD-0001" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { hasDelivery: boolean };
    expect(data.hasDelivery).toBe(false);
  });

  it("returns error when neither orderNumber nor orderId is provided", async () => {
    const tool = getTool("get_delivery_status")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });
});

// ── search_conversations ─────────────────────────────────────────────────────

describe("search_conversations", () => {
  it("returns conversations matching the contact name", async () => {
    await db.conversation.create({
      data: { channel: "whatsapp", contactName: "Ahmed Benali", contactPhone: "0551234567", lastMessageAt: new Date() },
    });
    await db.conversation.create({
      data: { channel: "whatsapp", contactName: "Fatima Zohra", contactPhone: "0661234567", lastMessageAt: new Date() },
    });

    const tool = getTool("search_conversations")!;
    const result = await tool.execute({ query: "Ahmed" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ contactName: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.contactName).toBe("Ahmed Benali");
  });

  it("returns empty array when no conversations match", async () => {
    const tool = getTool("search_conversations")!;
    const result = await tool.execute({ query: "nobody" }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns error when query is missing", async () => {
    const tool = getTool("search_conversations")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── get_pending_deliveries ───────────────────────────────────────────────────

describe("get_pending_deliveries", () => {
  it("returns deliveries that are pending or in transit", async () => {
    const customer = await seedCustomer(db, { name: "Sami", phone: uniquePhone() });
    const order1 = await db.order.create({
      data: { orderNumber: "ORD-0001", status: "shipped", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    const order2 = await db.order.create({
      data: { orderNumber: "ORD-0002", status: "delivered", customerId: customer.id, totalPrice: 1000, wilaya: "Oran", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.delivery.create({ data: { orderId: order1.id, provider: "yalidine", status: "in_transit" } });
    await db.delivery.create({ data: { orderId: order2.id, provider: "yalidine", status: "delivered" } });

    const tool = getTool("get_pending_deliveries")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ status: string; orderNumber: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.status).toBe("in_transit");
    expect(data[0]!.orderNumber).toBe("ORD-0001");
  });

  it("returns empty array when no pending deliveries exist", async () => {
    const tool = getTool("get_pending_deliveries")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

// ── get_top_products ─────────────────────────────────────────────────────────

describe("get_top_products", () => {
  it("returns best-selling products by quantity for the 'all' period", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "delivered", customerId: customer.id,
        totalPrice: 7000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual",
        items: {
          create: [
            { productName: "Widget A", quantity: 5, unitPrice: 1000, total: 5000 },
            { productName: "Widget B", quantity: 1, unitPrice: 2000, total: 2000 },
          ],
        },
      },
    });

    const tool = getTool("get_top_products")!;
    const result = await tool.execute({ period: "all", metric: "quantity" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string; quantity: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]!.name).toBe("Widget A");
    expect(data[0]!.quantity).toBe(5);
  });

  it("returns empty array when no order items exist", async () => {
    const tool = getTool("get_top_products")!;
    const result = await tool.execute({ period: "all" }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("sorts by revenue when metric='revenue'", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "delivered", customerId: customer.id,
        totalPrice: 3000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual",
        items: {
          create: [
            { productName: "Cheap Volume", quantity: 10, unitPrice: 100, total: 1000 },
            { productName: "Premium Item", quantity: 1, unitPrice: 2000, total: 2000 },
          ],
        },
      },
    });

    const tool = getTool("get_top_products")!;
    const result = await tool.execute({ period: "all", metric: "revenue" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string; revenue: number }>;
    expect(data[0]!.name).toBe("Premium Item");
    expect(data[0]!.revenue).toBe(2000);
  });
});

// ── update_product_stock ─────────────────────────────────────────────────────

describe("update_product_stock", () => {
  it("updates the stock to a new value", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { name: "Widget", stock: 50, categoryId: cat.id });

    const tool = getTool("update_product_stock")!;
    const result = await tool.execute({ productId: product.id, newStock: 25, reason: "Damaged" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; stock: number };
    expect(data.id).toBe(product.id);
    expect(data.stock).toBe(25);

    const updated = await db.product.findUnique({ where: { id: product.id } });
    expect(updated!.stock).toBe(25);
  });

  it("returns error for a non-existent product", async () => {
    const tool = getTool("update_product_stock")!;
    const result = await tool.execute({ productId: "cnonexistent123456789", newStock: 10 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for a negative stock value", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { categoryId: cat.id });

    const tool = getTool("update_product_stock")!;
    const result = await tool.execute({ productId: product.id, newStock: -5 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── cancel_order ─────────────────────────────────────────────────────────────

describe("cancel_order", () => {
  it("cancels a draft order and appends a cancellation note", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("cancel_order")!;
    const result = await tool.execute({ orderNumber: "ORD-0001", reason: "Client absent" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { orderNumber: string; status: string };
    expect(data.status).toBe("cancelled");

    const updated = await db.order.findUnique({ where: { orderNumber: "ORD-0001" } });
    expect(updated!.notes).toContain("[Annulée: Client absent]");
  });

  it("refuses to cancel a shipped order", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "shipped", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("cancel_order")!;
    const result = await tool.execute({ orderNumber: "ORD-0001" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("statut");
  });

  it("returns error when order is not found", async () => {
    const tool = getTool("cancel_order")!;
    const result = await tool.execute({ orderNumber: "ORD-9999" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("introuvable");
  });
});

// ── get_wilaya_risk ──────────────────────────────────────────────────────────

describe("get_wilaya_risk", () => {
  it("returns the risk profile + assessment for a seeded wilaya", async () => {
    await db.wilayaRiskProfile.create({
      data: { wilaya: "Alger", riskLevel: 2, confirmationRate: 0.78, returnRate: 0.12 },
    });

    const tool = getTool("get_wilaya_risk")!;
    const result = await tool.execute({ wilaya: "Alger" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { wilaya: string; riskLevel: number; label: string; recommendation: string };
    expect(data.wilaya).toBe("Alger");
    expect(data.riskLevel).toBe(2);
    expect(data.label).toBe("Faible");
    expect(data.recommendation).toBeTruthy();
  });

  it("returns error when no profile exists for the wilaya", async () => {
    const tool = getTool("get_wilaya_risk")!;
    const result = await tool.execute({ wilaya: "Inconnue" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("profil de risque");
  });

  it("returns error when wilaya is missing", async () => {
    const tool = getTool("get_wilaya_risk")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
