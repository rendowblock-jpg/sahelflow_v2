/**
 * Integration test for Phase 1 bug 1.4 — `POST /api/delivery/create` was
 * missing the `order.shipped` trigger dispatch.
 *
 * Before the fix, the route flipped `order.status` to "shipped" inside its
 * `$transaction` (and recorded an OrderChange ledger entry) but never fired
 * `dispatchTrigger("order.shipped", ...)`. As a result, "ship → WhatsApp
 * notify" automations never fired when a shipment was created via the API
 * route — only the AI `create_shipment` tool fired the trigger.
 *
 * Test flow:
 *   1. Seed a confirmed order + a `order.shipped` automation that runs a
 *      `send_notification` action.
 *   2. Mock the delivery adapter so `createShipment` returns a fake tracking
 *      id without hitting a real provider.
 *   3. POST /api/delivery/create with the order id.
 *   4. Poll `automationLog` for a row with `trigger = "order.shipped"`.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  rawDb,
  cleanDb,
  mockPost,
  getJson,
  seedProduct,
  establishAuthenticatedTestSession,
} from "@/app/api/__tests__/helpers";

// Protected delivery-route scenarios use one real revocable session.
const authCookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = authCookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      authCookieStore.set(name, value);
    },
    delete: (name: string) => {
      authCookieStore.delete(name);
    },
  })),
}));

// ── Mock the delivery adapter so createShipment succeeds without a provider ─
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
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

import { POST } from "@/app/api/delivery/create/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
  const order = await rawDb.order.create({
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
        create: [{
          productId: product.id,
          productName: "Test Product",
          quantity: 2,
          unitPrice: 2500,
          total: 5000,
        }],
      },
    },
    include: { items: true },
  });
  return order;
}

async function createShippedAutomation() {
  return rawDb.automation.create({
    data: {
      name: "Ship notifier",
      trigger: "order.shipped",
      action: "send_notification",
      config: JSON.stringify({ messageTemplate: "Shipped: {{orderNumber}}" }),
      isActive: true,
      runCount: 0,
    },
  });
}

/** Poll the AutomationLog table for an `order.shipped` row (or timeout). */
async function waitForShippedLog(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const logs = await rawDb.automationLog.findMany({
      where: { trigger: "order.shipped" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (logs.length > 0) return logs;
    await new Promise((r) => setTimeout(r, 25));
  }
  return [];
}

describe("POST /api/delivery/create — order.shipped trigger (Phase 1 bug 1.4)", () => {
  beforeEach(async () => {
    await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession();
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
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await rawDb.$disconnect();
  });

  it("fires order.shipped automation trigger after creating the shipment", async () => {
    const order = await seedConfirmedOrder();
    await createShippedAutomation();

    const res = await POST(
      mockPost("http://localhost/api/delivery/create", {
        orderId: order.id,
        provider: "yalidine",
      }),
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    expect(body.delivery).toBeTruthy();

    // The automation trigger should fire + log an entry.
    const logs = await waitForShippedLog();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.trigger).toBe("order.shipped");
    // The automation either succeeded or was skipped (e.g. sidecar not running)
    // — what we care about is that the trigger was DISPATCHED at all.
    expect(["success", "skipped", "failed"]).toContain(logs[0]!.status);

    // The order should now be "shipped" + shippedAt set.
    const updated = await rawDb.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe("shipped");
    expect(updated!.shippedAt).toBeTruthy();
  });

  it("does not fire order.shipped when the adapter fails (502 response)", async () => {
    const order = await seedConfirmedOrder();
    await createShippedAutomation();

    // Make the adapter fail
    mockAdapter.createShipment.mockResolvedValue({
      success: false,
      error: "provider down",
    });

    const res = await POST(
      mockPost("http://localhost/api/delivery/create", {
        orderId: order.id,
        provider: "yalidine",
      }),
    );
    expect(res.status).toBe(502);

    // Trigger should NOT have fired (we returned early before the tx).
    const logs = await waitForShippedLog(400);
    expect(logs.length).toBe(0);
  });
});
