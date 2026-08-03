/**
 * Integration test for the `order.shipped` trigger producer after shipment
 * creation. The route must queue durable automation work only after the local
 * shipment and order transition commit.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  rawDb,
  cleanDb,
  mockPost,
  getJson,
  seedProduct,
} from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

const mockAdapter = {
  id: "yalidine" as const,
  name: "Yalidine",
  logo: "📦",
  estimateCost: vi.fn(),
  createShipment: vi.fn(),
  syncTracking: vi.fn(),
};

vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => mockAdapter),
  loadDeliveryCredentials: vi
    .fn()
    .mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

import { POST } from "@/app/api/delivery/create/route";

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

async function seedConfirmedOrder() {
  const product = await seedProduct({ price: 2500, stock: 100 });
  const customer = await rawDb.customer.create({
    data: {
      name: "Ship Test",
      phone: "0555123456",
      nameBlindIndex: "ship-test",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
    },
  });
  return rawDb.order.create({
    data: {
      orderNumber: "ORD-SHIP-0001",
      status: "confirmed",
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
      items: {
        create: [
          {
            productId: product.id,
            productName: "Test Product",
            quantity: 2,
            unitPrice: 2500,
            total: 5000,
          },
        ],
      },
    },
    include: { items: true },
  });
}

async function createShippedAutomation() {
  return rawDb.automation.create({
    data: {
      name: "Ship notifier",
      trigger: "order.shipped",
      action: "send_notification",
      config: JSON.stringify({
        messageTemplate: "Shipped: {{orderNumber}}",
      }),
      isActive: true,
      runCount: 0,
    },
  });
}

async function waitForShippedLog(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const logs = await rawDb.automationLog.findMany({
      where: { trigger: "order.shipped" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (logs.length > 0) return logs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

describe("POST /api/delivery/create — order.shipped trigger", () => {
  beforeEach(async () => {
    await cleanDb();
    mockAdapter.createShipment.mockReset();
    mockAdapter.createShipment.mockResolvedValue({
      success: true,
      trackingId: "YAL-TRACK-123",
      cost: 600,
      labelUrl: "https://example.com/label.pdf",
      estimatedDelivery: null,
    });
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("queues order.shipped automation work after creating the shipment", async () => {
    const order = await seedConfirmedOrder();
    await createShippedAutomation();

    const response = await POST(
      mockPost("http://localhost/api/delivery/create", {
        orderId: order.id,
        provider: "yalidine",
      }),
    );

    expect(response.status).toBe(200);
    const body = await getJson(response);
    expect(body.ok).toBe(true);
    expect(body.delivery).toBeTruthy();

    const logs = await waitForShippedLog();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.shipped");
    expect(logs[0]!.status).toBe("queued");

    const updated = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe("shipped");
    expect(updated!.shippedAt).toBeTruthy();
  });

  it("does not queue order.shipped when the adapter fails", async () => {
    const order = await seedConfirmedOrder();
    await createShippedAutomation();
    mockAdapter.createShipment.mockResolvedValue({
      success: false,
      error: "provider down",
    });

    const response = await POST(
      mockPost("http://localhost/api/delivery/create", {
        orderId: order.id,
        provider: "yalidine",
      }),
    );
    expect(response.status).toBe(502);

    const logs = await waitForShippedLog(400);
    expect(logs.length).toBe(0);
  });
});
