import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { mockAdapter } = vi.hoisted(() => ({
  mockAdapter: {
    id: "yalidine",
    name: "Yalidine",
    logo: "delivery",
    estimateCost: vi.fn(),
    createShipment: vi.fn(),
    syncTracking: vi.fn(),
  },
}));

vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => mockAdapter),
  loadDeliveryCredentials: vi.fn(async () => ({ apiId: "x", apiToken: "y" })),
}));

import "@/lib/ai/chat/tools/advanced-tools";
import { getTool, type ToolContext } from "../registry";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
  mockAdapter.createShipment.mockReset();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function context(): ToolContext {
  return { db, shop: TEST_SHOP_CONTEXT };
}

describe("assign_order_to_delivery transaction", () => {
  it("re-reads state and preserves the provider receipt instead of resurrecting a cancelled order", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-AI-RACE-1",
        status: "confirmed",
        customerId: customer.id,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Alger",
        address: "Test",
        phone: customer.phone,
        source: "manual",
      },
    });
    const gate = deferred<{ success: true; trackingId: string; cost: number }>();
    mockAdapter.createShipment.mockReturnValueOnce(gate.promise);

    const tool = getTool("assign_order_to_delivery");
    if (!tool) throw new Error("assign_order_to_delivery was not registered");
    const execution = tool.execute(
      { orderNumber: order.orderNumber, provider: "yalidine" },
      context(),
    );
    await vi.waitFor(() => expect(mockAdapter.createShipment).toHaveBeenCalledOnce());
    await db.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    gate.resolve({ success: true, trackingId: "TRK-AI-RACE-1", cost: 600 });

    await expect(execution).resolves.toMatchObject({ success: false });
    expect((await db.order.findUnique({ where: { id: order.id } }))?.status).toBe("cancelled");
    expect(await db.delivery.findUnique({ where: { orderId: order.id } })).toMatchObject({
      trackingNumber: "TRK-AI-RACE-1",
      status: "reconciliation_required",
    });
    expect(await db.orderChange.count({
      where: { orderId: order.id, actionType: "status_change" },
    })).toBe(0);
  });

  it("blocks retries when provider success has no tracking receipt", async () => {
    const customer = await seedCustomer(db);
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-AI-NO-RECEIPT-1",
        status: "confirmed",
        customerId: customer.id,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Alger",
        address: "Test",
        phone: customer.phone,
        source: "manual",
      },
    });
    mockAdapter.createShipment.mockResolvedValueOnce({
      success: true,
      trackingId: "",
      cost: 600,
    });

    const tool = getTool("assign_order_to_delivery");
    if (!tool) throw new Error("assign_order_to_delivery was not registered");
    await expect(tool.execute(
      { orderNumber: order.orderNumber, provider: "yalidine" },
      context(),
    )).resolves.toMatchObject({ success: false });

    expect(await db.delivery.findUnique({ where: { orderId: order.id } })).toMatchObject({
      trackingNumber: null,
      status: "reconciliation_required",
    });
    await expect(tool.execute(
      { orderNumber: order.orderNumber, provider: "yalidine" },
      context(),
    )).resolves.toMatchObject({ success: false });
    expect(mockAdapter.createShipment).toHaveBeenCalledOnce();
  });
});
