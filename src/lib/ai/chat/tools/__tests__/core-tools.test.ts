/**
 * Core AI chat tools tests — 6 tools registered in core-tools.ts.
 *
 * Each tool is registered as a side-effect of importing core-tools.ts.
 * We fetch it via `getTool(name)` and call its `execute(params, ctx)` with a
 * real PrismaClient (raw, no PII extension — fields stored as plaintext) +
 * seeded data.
 *
 * The delivery adapter (used by `estimate_delivery_cost`) is mocked to avoid
 * network calls to Yalidine/Maystro/ZR Express APIs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// ── Mock the delivery integration BEFORE importing the tools ────────────────
// `vi.hoisted` runs before the mock factory so the adapter object is available.
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

import "@/lib/ai/chat/tools/core-tools"; // side-effect: registers 6 tools
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
  // Reset delivery mock defaults
  mockAdapter.estimateCost.mockResolvedValue({
    provider: "yalidine",
    cost: 600,
    available: true,
  });
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

function ctx(): ToolContext {
  return { db };
}

// ── search_products ──────────────────────────────────────────────────────────

describe("search_products", () => {
  it("returns products matching the query by name", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Cotton T-Shirt", categoryId: cat.id });
    await seedProduct(db, { name: "Denim Jeans", categoryId: cat.id });

    const tool = getTool("search_products")!;
    const result = await tool.execute({ query: "cotton" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.name).toBe("Cotton T-Shirt");
  });

  it("returns products matching the query by SKU", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Widget", sku: "WDG-001", categoryId: cat.id });
    await seedProduct(db, { name: "Gadget", sku: "GDG-002", categoryId: cat.id });

    const tool = getTool("search_products")!;
    const result = await tool.execute({ query: "GDG" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ sku: string | null }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.sku).toBe("GDG-002");
  });

  it("filters by category name", async () => {
    const electronics = await seedCategory(db, "Electronics");
    const clothing = await seedCategory(db, "Clothing");
    await seedProduct(db, { name: "Phone", categoryId: electronics.id });
    await seedProduct(db, { name: "Shirt", categoryId: clothing.id });

    const tool = getTool("search_products")!;
    const result = await tool.execute({ category: "Elec" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.name).toBe("Phone");
  });

  it("returns empty array when no products match", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Widget", categoryId: cat.id });

    const tool = getTool("search_products")!;
    const result = await tool.execute({ query: "nonexistent" }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("excludes inactive products", async () => {
    const cat = await seedCategory(db);
    await seedProduct(db, { name: "Active Widget", categoryId: cat.id });
    await db.product.create({
      data: { name: "Inactive Widget", price: 1000, stock: 5, categoryId: cat.id, isActive: false },
    });

    const tool = getTool("search_products")!;
    const result = await tool.execute({ query: "Widget" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.name).toBe("Active Widget");
  });

  it("returns error when limit is out of range", async () => {
    const tool = getTool("search_products")!;
    const result = await tool.execute({ limit: 100 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── search_customers ─────────────────────────────────────────────────────────

describe("search_customers", () => {
  it("finds a customer by exact phone match", async () => {
    await seedCustomer(db, { name: "Ahmed Benali", phone: "0551234567" });

    const tool = getTool("search_customers")!;
    const result = await tool.execute({ query: "0551234567" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string; phone: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.name).toBe("Ahmed Benali");
    expect(data[0]!.phone).toBe("0551234567");
  });

  it("finds customers by name substring (in-memory filter)", async () => {
    await seedCustomer(db, { name: "Fatima Zohra", phone: uniquePhone() });
    await seedCustomer(db, { name: "Mohamed Saidi", phone: uniquePhone() });

    const tool = getTool("search_customers")!;
    const result = await tool.execute({ query: "fatima" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.name).toBe("Fatima Zohra");
  });

  it("returns empty array when no customers match", async () => {
    await seedCustomer(db, { name: "Ahmed", phone: uniquePhone() });

    const tool = getTool("search_customers")!;
    const result = await tool.execute({ query: "nonexistent" }, ctx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("returns error when query is missing", async () => {
    const tool = getTool("search_customers")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── create_order ─────────────────────────────────────────────────────────────

describe("create_order", () => {
  it("creates an order for an existing customer with valid items", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const cat = await seedCategory(db);
    const product = await seedProduct(db, { name: "Test Product", price: 2500, stock: 50, categoryId: cat.id });

    const tool = getTool("create_order")!;
    const result = await tool.execute({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0551234567",
      notes: "Livraison rapide",
    }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; orderNumber: string; total: number; status: string };
    expect(data.id).toBeTruthy();
    expect(data.orderNumber).toMatch(/^ORD-\d{4}$/);
    expect(data.total).toBe(5000); // 2 × 2500
    expect(data.status).toBe("draft");
  });

  it("returns error when a product does not exist", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });

    const tool = getTool("create_order")!;
    const result = await tool.execute({
      customerId: customer.id,
      items: [{ productId: "cnonexistent123456789", quantity: 1 }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123",
      phone: "0551234567",
    }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Produit introuvable");
  });

  it("returns error when items array is empty", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });

    const tool = getTool("create_order")!;
    const result = await tool.execute({
      customerId: customer.id,
      items: [],
      wilaya: "Alger",
      commune: "X",
      address: "Y",
      phone: "0551234567",
    }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error when required fields are missing", async () => {
    const tool = getTool("create_order")!;
    const result = await tool.execute({ items: [] }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── get_stats ────────────────────────────────────────────────────────────────

describe("get_stats", () => {
  it("returns zero stats on an empty database", async () => {
    const tool = getTool("get_stats")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { totalOrders: number; grossRevenue: number; totalCustomers: number; lowStockCount: number };
    expect(data.totalOrders).toBe(0);
    expect(data.grossRevenue).toBe(0);
    expect(data.totalCustomers).toBe(0);
    expect(data.lowStockCount).toBe(0);
  });

  it("aggregates orders, revenue, customers, and low-stock products", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const cat = await seedCategory(db);
    // Product with low stock (stock=3 ≤ threshold=5)
    await seedProduct(db, { name: "Low Stock Item", stock: 3, lowStockThreshold: 5, categoryId: cat.id });
    // Product with healthy stock
    await seedProduct(db, { name: "OK Item", stock: 100, lowStockThreshold: 5, categoryId: cat.id });
    // Order with realized revenue (delivered)
    await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "delivered", customerId: customer.id,
        totalPrice: 4000, wilaya: "Alger", commune: "Bab Ezzouar",
        address: "123", phone: "0551234567", source: "manual",
      },
    });
    // Draft order (not counted in revenue)
    await db.order.create({
      data: {
        orderNumber: "ORD-0002", status: "draft", customerId: customer.id,
        totalPrice: 9999, wilaya: "Alger", commune: "Bab Ezzouar",
        address: "123", phone: "0551234567", source: "manual",
      },
    });

    const tool = getTool("get_stats")!;
    const result = await tool.execute({}, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { totalOrders: number; grossRevenue: number; totalCustomers: number; lowStockCount: number };
    expect(data.totalOrders).toBe(2);
    // Phase 4: canonical gross = excludes cancelled + draft only.
    // Setup: 1 delivered (4000) + 1 draft (excluded). Gross = 4000.
    expect(data.grossRevenue).toBe(4000);
    expect(data.totalCustomers).toBe(1);
    expect(data.lowStockCount).toBe(1);
  });
});

// ── update_order_status ──────────────────────────────────────────────────────

describe("update_order_status", () => {
  it("transitions an order draft → pending", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "Alger", commune: "Bab Ezzouar",
        address: "123", phone: "0551234567", source: "manual",
      },
    });

    const tool = getTool("update_order_status")!;
    const result = await tool.execute({ orderId: order.id, status: "pending" }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { id: string; status: string };
    expect(data.id).toBe(order.id);
    expect(data.status).toBe("pending");
  });

  it("rejects an invalid transition (draft → delivered)", async () => {
    const customer = await seedCustomer(db, { phone: uniquePhone() });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-0001", status: "draft", customerId: customer.id,
        totalPrice: 1000, wilaya: "Alger", commune: "Bab Ezzouar",
        address: "123", phone: "0551234567", source: "manual",
      },
    });

    const tool = getTool("update_order_status")!;
    const result = await tool.execute({ orderId: order.id, status: "delivered" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for a non-existent order", async () => {
    const tool = getTool("update_order_status")!;
    const result = await tool.execute({ orderId: "cnonexistent123456789", status: "pending" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error for an invalid status value", async () => {
    const tool = getTool("update_order_status")!;
    const result = await tool.execute({ orderId: "any", status: "invalid_status" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── estimate_delivery_cost ───────────────────────────────────────────────────

describe("estimate_delivery_cost", () => {
  it("returns the cost estimate from the adapter", async () => {
    mockAdapter.estimateCost.mockResolvedValueOnce({
      provider: "yalidine",
      cost: 600,
      available: true,
      estimatedDays: "2-3",
    });

    const tool = getTool("estimate_delivery_cost")!;
    const result = await tool.execute({ wilaya: "Alger", weight: 1, codAmount: 5000 }, ctx());

    expect(result.success).toBe(true);
    const data = result.data as { provider: string; cost: number; available: boolean };
    expect(data.provider).toBe("yalidine");
    expect(data.cost).toBe(600);
    expect(data.available).toBe(true);
    expect(mockAdapter.estimateCost).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when the adapter says so", async () => {
    mockAdapter.estimateCost.mockResolvedValueOnce({
      provider: "yalidine",
      cost: 0,
      available: false,
      error: "Zone non couverte",
    });

    const tool = getTool("estimate_delivery_cost")!;
    const result = await tool.execute({ wilaya: "Tamanrasset", weight: 2 }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Zone non couverte");
  });

  it("returns error for an unknown provider", async () => {
    const tool = getTool("estimate_delivery_cost")!;
    const result = await tool.execute({ provider: "unknown_provider", wilaya: "Alger" }, ctx());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("uses default values when optional params are omitted", async () => {
    mockAdapter.estimateCost.mockResolvedValueOnce({
      provider: "yalidine",
      cost: 600,
      available: true,
    });

    const tool = getTool("estimate_delivery_cost")!;
    const result = await tool.execute({ wilaya: "Oran" }, ctx());

    expect(result.success).toBe(true);
    // The adapter should have been called with default weight=1 and codAmount=0
    expect(mockAdapter.estimateCost).toHaveBeenCalledWith(
      expect.objectContaining({ wilaya: "Oran", weight: 1, codAmount: 0 }),
      expect.anything(),
    );
  });
});
