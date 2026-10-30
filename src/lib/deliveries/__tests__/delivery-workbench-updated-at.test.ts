/**
 * B6 — the list must carry Delivery.updatedAt so the row can tell a booking
 * stuck in `creating` (15 minutes without a touch) from a live one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { delivery: { findMany: h.findMany, count: h.count } },
}));
vi.mock("@/lib/identity/authorization", () => ({
  assertTrustedAction: vi.fn(),
  trustedActionAllowed: () => true,
}));

import { getDeliveryWorkbenchPage } from "@/lib/deliveries/delivery-workbench";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

const ACTOR = { shop: { shopId: "shop-test" } } as unknown as TrustedActorContext;
const TOUCHED = new Date("2026-10-30T11:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  h.count.mockResolvedValue(1);
  h.findMany.mockResolvedValue([
    {
      id: "d1", orderId: "o1", provider: "yalidine", trackingNumber: null, cost: null,
      status: "creating", estimatedDelivery: null,
      createdAt: new Date("2026-10-30T11:00:00.000Z"), updatedAt: TOUCHED,
      order: { id: "o1", orderNumber: "SF-1", wilaya: null, customer: null },
    },
  ]);
});

describe("delivery workbench list", () => {
  it("asks the database for updatedAt", async () => {
    await getDeliveryWorkbenchPage(ACTOR, {});
    const args = h.findMany.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(args.select.updatedAt).toBe(true);
  });
  it("hands updatedAt to the client with each row", async () => {
    const page = await getDeliveryWorkbenchPage(ACTOR, {});
    expect(page.deliveries[0]?.updatedAt).toEqual(TOUCHED);
  });
});
