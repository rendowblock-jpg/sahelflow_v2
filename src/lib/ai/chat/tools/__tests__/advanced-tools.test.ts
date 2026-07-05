/**
 * Advanced AI chat tools tests — 12 tools registered in advanced-tools.ts.
 *
 * Covers: create_product, update_product_price, get_product_details,
 * create_customer, update_customer_notes, get_customer_orders,
 * assign_order_to_delivery, get_delivery_cost_comparison, get_returns_summary,
 * get_sales_by_wilaya, get_conversation_messages, search_orders.
 *
 * The delivery adapter (used by assign_order_to_delivery and
 * get_delivery_cost_comparison) is mocked to avoid network calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// ── Mock the delivery integration BEFORE importing the tools ────────────────
const { mockAdapter } = vi.hoisted(() => ({
  mockAdapter: {
    id: "yalidine",
    name: "Yalidine",
    logo: "📦",
    estimateCost: vi.fn(),
    createShipment: vi.fn(),
    syncTracking: vi.fn(),
  },
}));

vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => mockAdapter),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

import "@/lib/ai/chat/tools/advanced-tools"; // side-effect: registers 12 tools
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
  // cleanDb doesn't clean Conversation/Message — do it explicitly
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  // Reset delivery mock defaults
  mockAdapter.estimateCost.mockResolvedValue({
    provider: "yalidine",
    cost: 600,
    available: true,
  });
  mockAdapter.createShipment.mockResolvedValue({
    success: true,
    trackingId: "TRK-001",
    cost: 600,
  });
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

function ctx(): ToolContext {
  return { db };
}

// ── create_product ───────────────────────────────────────────────────────────

describe("create_product", () => {
  it("creates a new product with valid input", async () => {
    const tool = getTool("create_product")!;
    const result = await tool.execute({
      name: "Wireless Headphones",
      price: 4500,
      sku: "WH-001",
      stock: 30,
    }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; name: string; price: number; sku: string };
    expect(data.id).toBeTruthy();
    expect(data.name).toBe("Wireless Headphones");
    expect(data.price).toBe(4500);
    expect(data.sku).toBe("WH-001");
  });

  it("creates a product with default stock when omitted", async () => {
    const tool = getTool("create_product")!;
    const result = await tool.execute({ name: "Minimal Product", price: 1000 }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { stock: number };
    expect(data.stock).toBe(0);
  });

  it("returns error when required fields are missing", async () => {
    const tool = getTool("create_product")!;
    const result = await tool.execute({ name: "No Price" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for a negative price", async () => {
    const tool = getTool("create_product")!;
    const result = await tool.execute({ name: "Bad", price: -100 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── update_product_price ─────────────────────────────────────────────────────

describe("update_product_price", () => {
  it("updates a product's price", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { name: "Widget", price: 1000, categoryId: cat.id });

    const tool = getTool("update_product_price")!;
    const result = await tool.execute({ productId: product.id, newPrice: 1500 }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; price: number };
    expect(data.id).toBe(product.id);
    expect(data.price).toBe(1500);
  });

  it("returns error for a non-existent product", async () => {
    const tool = getTool("update_product_price")!;
    const result = await tool.execute({ productId: "cnonexistent123456789", newPrice: 1000 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for a negative price", async () => {
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { categoryId: cat.id });

    const tool = getTool("update_product_price")!;
    const result = await tool.execute({ productId: product.id, newPrice: -50 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── get_product_details ──────────────────────────────────────────────────────

describe("get_product_details", () => {
  it("fetches a product by ID", async () => {
    const cat = await seedCategory(db, "Electronics");
    const product = await seedProduct(db, { name: "Phone", price: 30000, categoryId: cat.id });

    const tool = getTool("get_product_details")!;
    const result = await tool.execute({ productId: product.id }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; name: string; category: string };
    expect(data.id).toBe(product.id);
    expect(data.name).toBe("Phone");
    expect(data.category).toBe("Electronics");
  });

  it("fetches a product by SKU", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Gadget", sku: "GDG-999", categoryId: cat.id });

    const tool = getTool("get_product_details")!;
    const result = await tool.execute({ sku: "GDG-999" }, ctx());

    expect(result.success).toBe(true);
    expect((result.data as { name: string }).name).toBe("Gadget");
  });

  it("returns error when product is not found", async () => {
    const tool = getTool("get_product_details")!;
    const result = await tool.execute({ productId: "cnonexistent123456789" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("introuvable");
  });

  it("returns error when neither productId nor sku is provided", async () => {
    const tool = getTool("get_product_details")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });
});

// ── create_customer ──────────────────────────────────────────────────────────

describe("create_customer", () => {
  it("creates a new customer with valid input", async () => {
    const tool = getTool("create_customer")!;
    const result = await tool.execute({
      name: "Karim Haddad",
      phone: "0770123456",
      wilaya: "Oran",
      commune: "Centre",
      address: "45 Rue Larbi Ben Mhidi",
    }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; name: string; phone: string; wilaya: string };
    expect(data.id).toBeTruthy();
    expect(data.name).toBe("Karim Haddad");
    expect(data.phone).toBe("0770123456");
    expect(data.wilaya).toBe("Oran");
  });

  it("returns error when required fields are missing", async () => {
    const tool = getTool("create_customer")!;
    const result = await tool.execute({ name: "No Phone" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error on duplicate phone (unique constraint)", async () => {
    await seedCustomer(db, { phone: "0770111222" });

    const tool = getTool("create_customer")!;
    const result = await tool.execute({ name: "Dup", phone: "0770111222" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── update_customer_notes ────────────────────────────────────────────────────

describe("update_customer_notes", () => {
  it("appends notes to existing notes in append mode", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.customer.update({ where: { id: customer.id }, data: { notes: "Première note" } });

    const tool = getTool("update_customer_notes")!;
    const result = await tool.execute({ customerId: customer.id, notes: "Nouvelle note" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { notes: string };
    expect(data.notes).toContain("Première note");
    expect(data.notes).toContain("Nouvelle note");
  });

  it("replaces notes in replace mode", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.customer.update({ where: { id: customer.id }, data: { notes: "Old note" } });

    const tool = getTool("update_customer_notes")!;
    const result = await tool.execute({ customerId: customer.id, notes: "Brand new", mode: "replace" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { notes: string };
    expect(data.notes).toBe("Brand new");
    expect(data.notes).not.toContain("Old note");
  });

  it("returns error for a non-existent customer", async () => {
    const tool = getTool("update_customer_notes")!;
    const result = await tool.execute({ customerId: "cnonexistent123456789", notes: "x" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("introuvable");
  });
});

// ── get_customer_orders ──────────────────────────────────────────────────────

describe("get_customer_orders", () => {
  it("returns the customer's order history", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "draft", customerId: customer.id, totalPrice: 2000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("get_customer_orders")!;
    const result = await tool.execute({ customerId: customer.id }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ orderNumber: string }>;
    expect(data).toHaveLength(2);
    expect(data[0]!.orderNumber).toBe("ORD-0002"); // most recent first
  });

  it("returns empty array when customer has no orders", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });

    const tool = getTool("get_customer_orders")!;
    const result = await tool.execute({ customerId: customer.id }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

// ── assign_order_to_delivery ─────────────────────────────────────────────────

describe("assign_order_to_delivery", () => {
  it("creates a delivery + ships a confirmed order", async () => {
    const customer = await seedCustomer(db, { name: "Sami", phone: uniquePhone() });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id,
        totalPrice: 5000, wilaya: "Alger", commune: "Bab Ezzouar",
        address: "123", phone: "0551234567", source: "manual",
        items: { create: [{ productName: "Widget", quantity: 1, unitPrice: 5000, total: 5000 }] },
      },
    });

    const tool = getTool("assign_order_to_delivery")!;
    const result = await tool.execute({ orderNumber: "ORD-0001", provider: "yalidine" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { deliveryId: string; trackingId: string; provider: string; cost: number };
    expect(data.deliveryId).toBeTruthy();
    expect(data.trackingId).toBe("TRK-001");
    expect(data.provider).toBe("yalidine");
    expect(data.cost).toBe(600);

    // Order status should now be "shipped"
    const updated = await db.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe("shipped");
    expect(updated!.shippedAt).toBeTruthy();
  });

  it("refuses when the order already has a delivery", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const order = await db.order.create({
      data: { orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.delivery.create({ data: { orderId: order.id, provider: "yalidine", status: "created" } });

    const tool = getTool("assign_order_to_delivery")!;
    const result = await tool.execute({ orderNumber: "ORD-0001", provider: "yalidine" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("déjà une livraison");
  });

  it("refuses when the order is not confirmed", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("assign_order_to_delivery")!;
    const result = await tool.execute({ orderNumber: "ORD-0001", provider: "yalidine" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("confirmée");
  });

  it("returns error when the order is not found", async () => {
    const tool = getTool("assign_order_to_delivery")!;
    const result = await tool.execute({ orderNumber: "ORD-9999", provider: "yalidine" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("introuvable");
  });

  it("returns error when the adapter fails to create the shipment", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "confirmed", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    mockAdapter.createShipment.mockResolvedValueOnce({ success: false, trackingId: "", cost: 0, error: "API error" });

    const tool = getTool("assign_order_to_delivery")!;
    const result = await tool.execute({ orderNumber: "ORD-0001", provider: "yalidine" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("API error");
  });
});

// ── get_delivery_cost_comparison ─────────────────────────────────────────────

describe("get_delivery_cost_comparison", () => {
  it("compares costs across all three providers", async () => {
    // Sequential calls to estimateCost for yalidine, maystro, zrexpress
    mockAdapter.estimateCost
      .mockResolvedValueOnce({ provider: "yalidine", cost: 600, available: true })
      .mockResolvedValueOnce({ provider: "maystro", cost: 500, available: true })
      .mockResolvedValueOnce({ provider: "zrexpress", cost: 700, available: true });

    const tool = getTool("get_delivery_cost_comparison")!;
    const result = await tool.execute({ wilaya: "Alger", codAmount: 5000 }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ provider: string; cost: number; available: boolean }>;
    expect(data).toHaveLength(3);
    // Should be sorted: cheapest available first
    expect(data[0]!.provider).toBe("maystro");
    expect(data[0]!.cost).toBe(500);
  });

  it("marks unavailable providers and sorts them last", async () => {
    mockAdapter.estimateCost
      .mockResolvedValueOnce({ provider: "yalidine", cost: 600, available: true })
      .mockResolvedValueOnce({ provider: "maystro", cost: 0, available: false, error: "Zone non couverte" })
      .mockResolvedValueOnce({ provider: "zrexpress", cost: 0, available: false, error: "Erreur" });

    const tool = getTool("get_delivery_cost_comparison")!;
    const result = await tool.execute({ wilaya: "Tamanrasset", codAmount: 3000 }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ provider: string; available: boolean }>;
    expect(data).toHaveLength(3);
    expect(data[0]!.available).toBe(true);
    expect(data[0]!.provider).toBe("yalidine");
  });

  it("returns error when required fields are missing", async () => {
    const tool = getTool("get_delivery_cost_comparison")!;
    const result = await tool.execute({ wilaya: "Alger" }, ctx()); // missing codAmount

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── get_returns_summary ──────────────────────────────────────────────────────

describe("get_returns_summary", () => {
  it("summarizes returned + refused orders for the 'all' period", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "returned", customerId: customer.id, totalPrice: 3000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "refused", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0003", status: "delivered", customerId: customer.id, totalPrice: 5000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("get_returns_summary")!;
    const result = await tool.execute({ period: "all" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { returnedCount: number; refusedCount: number; totalReturns: number; totalOrders: number; returnRate: string; returnedValue: number };
    expect(data.returnedCount).toBe(1);
    expect(data.refusedCount).toBe(1);
    expect(data.totalReturns).toBe(2);
    expect(data.totalOrders).toBe(3);
    expect(data.returnedValue).toBe(3000);
  });

  it("returns zero counts on an empty database", async () => {
    const tool = getTool("get_returns_summary")!;
    const result = await tool.execute({ period: "all" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { totalReturns: number; totalOrders: number; returnRate: string };
    expect(data.totalReturns).toBe(0);
    expect(data.totalOrders).toBe(0);
    expect(data.returnRate).toBe("0%");
  });
});

// ── get_sales_by_wilaya ──────────────────────────────────────────────────────

describe("get_sales_by_wilaya", () => {
  it("breaks down revenue by wilaya for the 'all' period", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "delivered", customerId: customer.id, totalPrice: 5000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "delivered", customerId: customer.id, totalPrice: 2000, wilaya: "Oran", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0003", status: "delivered", customerId: customer.id, totalPrice: 3000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    // Cancelled — excluded
    await db.order.create({
      data: { orderNumber: "ORD-0004", status: "cancelled", customerId: customer.id, totalPrice: 9999, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("get_sales_by_wilaya")!;
    const result = await tool.execute({ period: "all" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ wilaya: string; orderCount: number; revenue: number }>;
    expect(data).toHaveLength(2);
    // Alger should be first (higher revenue: 5000 + 3000 = 8000)
    expect(data[0]!.wilaya).toBe("Alger");
    expect(data[0]!.revenue).toBe(8000);
    expect(data[0]!.orderCount).toBe(2);
    expect(data[1]!.wilaya).toBe("Oran");
    expect(data[1]!.revenue).toBe(2000);
  });

  it("returns empty array when no non-cancelled orders exist", async () => {
    const tool = getTool("get_sales_by_wilaya")!;
    const result = await tool.execute({ period: "all" }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });
});

// ── get_conversation_messages ────────────────────────────────────────────────

describe("get_conversation_messages", () => {
  it("returns messages in a conversation (oldest first after reverse)", async () => {
    const conversation = await db.conversation.create({
      data: { channel: "whatsapp", contactName: "Ahmed", contactPhone: "0551234567" },
    });
    const t1 = new Date("2024-01-01T10:00:00Z");
    const t2 = new Date("2024-01-01T11:00:00Z");
    await db.message.create({
      data: { conversationId: conversation.id, body: "Bonjour", direction: "inbound", timestamp: t1 },
    });
    await db.message.create({
      data: { conversationId: conversation.id, body: "Bonjour, comment puis-je aider ?", direction: "outbound", timestamp: t2 },
    });

    const tool = getTool("get_conversation_messages")!;
    const result = await tool.execute({ conversationId: conversation.id }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ body: string; direction: string }>;
    expect(data).toHaveLength(2);
    // Oldest first (reversed from desc query)
    expect(data[0]!.body).toBe("Bonjour");
    expect(data[1]!.body).toContain("aider");
  });

  it("returns empty array when conversation has no messages", async () => {
    const conversation = await db.conversation.create({
      data: { channel: "whatsapp", contactName: "Empty" },
    });

    const tool = getTool("get_conversation_messages")!;
    const result = await tool.execute({ conversationId: conversation.id }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns error when conversationId is missing", async () => {
    const tool = getTool("get_conversation_messages")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── search_orders ────────────────────────────────────────────────────────────

describe("search_orders", () => {
  it("finds orders by order number substring", async () => {
    const customer = await seedCustomer(db, { name: "Ahmed", phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-1234", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    // Use a phone + order number that do NOT contain "1234" so this order is
    // a true negative (the tool also matches by phone substring, so a phone
    // containing "1234" would falsely match the query).
    await db.order.create({
      data: { orderNumber: "ORD-5678", status: "draft", customerId: customer.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0779009009", source: "manual" },
    });

    const tool = getTool("search_orders")!;
    const result = await tool.execute({ query: "1234" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ orderNumber: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.orderNumber).toBe("ORD-1234");
  });

  it("finds orders by customer name substring", async () => {
    const c1 = await seedCustomer(db, { name: "Fatima Zohra", phone: uniquePhone() });
    const c2 = await seedCustomer(db, { name: "Mohamed Saidi", phone: uniquePhone() });
    await db.order.create({
      data: { orderNumber: "ORD-0001", status: "draft", customerId: c1.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });
    await db.order.create({
      data: { orderNumber: "ORD-0002", status: "draft", customerId: c2.id, totalPrice: 1000, wilaya: "Alger", commune: "X", address: "Y", phone: "0551234567", source: "manual" },
    });

    const tool = getTool("search_orders")!;
    const result = await tool.execute({ query: "fatima" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ orderNumber: string; customerName: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.customerName).toBe("Fatima Zohra");
  });

  it("returns empty array when no orders match", async () => {
    const tool = getTool("search_orders")!;
    const result = await tool.execute({ query: "nonexistent" }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns error when query is missing", async () => {
    const tool = getTool("search_orders")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
