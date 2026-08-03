import { beforeEach, describe, expect, it, vi } from "vitest";

const automation = vi.hoisted(() => ({
  dispatchTrigger: vi.fn(),
  detectLowStock: vi.fn(),
  dispatchLowStock: vi.fn(),
}));

vi.mock("@/lib/automations/engine", () => automation);

import { orderService } from "@/lib/data/order-service";
import type { Order } from "@/types/domain";

beforeEach(() => {
  automation.dispatchTrigger.mockReset().mockResolvedValue(undefined);
  automation.detectLowStock.mockReset();
  automation.dispatchLowStock.mockReset().mockResolvedValue(undefined);
});

describe("order status automation payload", () => {
  it("publishes the canonical customerPhone field and no legacy phone alias", async () => {
    const context = {} as never;
    const updatedAt = new Date("2026-08-03T12:00:00.000Z");
    const order = {
      id: "order-1",
      orderNumber: "ORD-0001",
      status: "delivered",
      customerId: "customer-1",
      totalPrice: 12_000,
      wilaya: "Alger",
      phone: "0555000111",
      updatedAt,
    } as unknown as Order;

    await orderService.dispatchStatusTransition(context, {
      order,
      changed: true,
      lowStockProducts: [],
    });

    expect(automation.dispatchTrigger).toHaveBeenCalledTimes(1);
    expect(automation.dispatchTrigger).toHaveBeenCalledWith(
      context,
      "order.delivered",
      {
        orderId: "order-1",
        orderNumber: "ORD-0001",
        customerId: "customer-1",
        customerPhone: "0555000111",
        totalPrice: 12_000,
        wilaya: "Alger",
      },
      {
        triggerKey: "order.delivered:order-1:2026-08-03T12:00:00.000Z",
        occurredAt: updatedAt,
      },
    );
    const payload = automation.dispatchTrigger.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(payload).not.toHaveProperty("phone");
  });
});
