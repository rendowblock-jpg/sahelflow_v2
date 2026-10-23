import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  testAuthenticatedOwnerBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import {
  createTestPrisma,
  disconnectTestPrisma,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import { queueCanonicalCourierBooking } from "@/lib/delivery/canonical-courier";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { STOP_DESK_ADDRESS } from "@/lib/orders/stop-desk-address";
import { SahelFlowError } from "@/types/errors";

/**
 * STORE-DESK-BOOKING: a stop-desk buyer gives no street address, so the order stores the fixed text
 * "Stop desk". Booking that order with a courier would send a HOME delivery to the address "Stop desk".
 * The booking command must refuse it, before it creates a delivery or an effect.
 */

let db: PrismaClient;
let context: BusinessPrincipalContext;

beforeEach(async () => {
  db = await createTestPrisma();
  context = {
    prisma: db as never,
    shop: TEST_SHOP_CONTEXT,
    businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("desk-owner"),
  };
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function readyOrder(address: string) {
  const category = await db.category.create({
    data: { name: `Desk ${randomUUID()}` },
  });
  const product = await db.product.create({
    data: {
      name: `Desk Product ${randomUUID()}`,
      price: 2500,
      cost: 1200,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });
  const sourceOrderId = randomUUID();
  const created = await createCanonicalSourceOrder(context, {
    idempotencyKey: `desk-source:${sourceOrderId}`,
    source: "storefront",
    sourceIdentity: "desk-test-store",
    sourceOrderId,
    newCustomer: {
      name: "Desk Customer",
      phone: "0555123456",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address,
    },
    items: [{ productId: product.id, quantity: 1 }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address,
    phone: "0555123456",
    deliveryCost: 400,
  });
  const confirmed = await executeManualOrderDecision(context, {
    orderId: created.result.order.id,
    decision: "confirm",
    expectedVersion: created.result.order.version,
    idempotencyKey: `desk-confirm:${sourceOrderId}`,
  });
  const packed = await executeCanonicalFulfillment(context, {
    orderId: created.result.order.id,
    action: "pack",
    expectedVersion: confirmed.result.version,
    idempotencyKey: `desk-pack:${sourceOrderId}`,
  });
  return {
    orderId: created.result.order.id,
    orderVersion: packed.result.version,
    sourceOrderId,
  };
}

async function book(order: Awaited<ReturnType<typeof readyOrder>>) {
  return queueCanonicalCourierBooking(context, {
    orderId: order.orderId,
    provider: "yalidine",
    expectedVersion: order.orderVersion,
    idempotencyKey: `desk-book:${order.sourceOrderId}`,
  });
}

async function refusal(order: Awaited<ReturnType<typeof readyOrder>>) {
  try {
    await book(order);
  } catch (error) {
    return error;
  }
  return null;
}

describe("courier booking refuses an order that only has the stop-desk placeholder address", () => {
  it("refuses with a coded 409, and leaves no delivery, no courier effect and the same order version", async () => {
    const order = await readyOrder(STOP_DESK_ADDRESS);

    const error = await refusal(order);

    expect(error).toBeInstanceOf(SahelFlowError);
    expect((error as SahelFlowError).code).toBe("STOP_DESK_ORDER_NOT_BOOKABLE");
    expect((error as SahelFlowError).statusCode).toBe(409);
    expect((error as SahelFlowError).message).toContain("stop-desk pickup");
    expect(await db.delivery.count()).toBe(0);
    expect(
      await db.outboxIntent.count({
        where: { effectType: "courier.shipment.create.v1" },
      }),
    ).toBe(0);
    const stored = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(stored.version).toBe(order.orderVersion);
    expect(stored.deliveryState).toBe("not_created");
  });

  it("also refuses the placeholder in another case and with spaces around it", async () => {
    const order = await readyOrder("  STOP   desk ");

    const error = await refusal(order);

    expect((error as SahelFlowError | null)?.code).toBe("STOP_DESK_ORDER_NOT_BOOKABLE");
    expect(await db.delivery.count()).toBe(0);
  });

  it("still books an order that has a real street address", async () => {
    const order = await readyOrder("12 Rue des Frères, Bab Ezzouar");

    const booking = await book(order);

    expect(booking.result.bookingState).toBe("queued");
    expect(await db.delivery.count()).toBe(1);
  });

  it("still books when the buyer typed a desk name next to the words (not the bare placeholder)", async () => {
    const order = await readyOrder("Stop desk Yalidine Bab Ezzouar");

    const booking = await book(order);

    expect(booking.result.bookingState).toBe("queued");
  });
});
