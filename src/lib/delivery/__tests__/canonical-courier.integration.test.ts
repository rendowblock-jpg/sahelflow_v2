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
import {
  drainDueCourierBookings,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
  queueCanonicalCourierBooking,
  reconcileCanonicalCourierBooking,
} from "@/lib/delivery/canonical-courier";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";

let db: PrismaClient;
let context: BusinessPrincipalContext;

beforeEach(async () => {
  db = await createTestPrisma();
  context = {
    prisma: db as never,
    shop: TEST_SHOP_CONTEXT,
    businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("courier-owner"),
  };
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function readyOrder() {
  const category = await db.category.create({
    data: { name: `Courier ${randomUUID()}` },
  });
  const product = await db.product.create({
    data: {
      name: `Courier Product ${randomUUID()}`,
      price: 2500,
      cost: 1200,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });
  const sourceOrderId = randomUUID();
  const created = await createCanonicalSourceOrder(context, {
    idempotencyKey: `courier-source:${sourceOrderId}`,
    source: "storefront",
    sourceIdentity: "courier-test-store",
    sourceOrderId,
    newCustomer: {
      name: "Courier Customer",
      phone: "0555123456",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Courier Street",
    },
    items: [{ productId: product.id, quantity: 2 }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "1 Courier Street",
    phone: "0555123456",
    deliveryCost: 500,
  });
  const confirmed = await executeManualOrderDecision(context, {
    orderId: created.result.order.id,
    decision: "confirm",
    expectedVersion: created.result.order.version,
    idempotencyKey: `courier-confirm:${sourceOrderId}`,
  });
  const packed = await executeCanonicalFulfillment(context, {
    orderId: created.result.order.id,
    action: "pack",
    expectedVersion: confirmed.result.version,
    idempotencyKey: `courier-pack:${sourceOrderId}`,
  });
  return {
    orderId: created.result.order.id,
    orderVersion: packed.result.version,
    productId: product.id,
    sourceOrderId,
  };
}

async function queuedBooking() {
  const order = await readyOrder();
  const booking = await queueCanonicalCourierBooking(context, {
    orderId: order.orderId,
    provider: "yalidine",
    expectedVersion: order.orderVersion,
    idempotencyKey: `courier-book:${order.sourceOrderId}`,
  });
  return { ...order, booking };
}

describe("canonical courier booking and tracking", () => {
  it("queues and replays one booking without duplicate delivery or effect", async () => {
    const order = await readyOrder();
    const input = {
      orderId: order.orderId,
      provider: "yalidine" as const,
      expectedVersion: order.orderVersion,
      idempotencyKey: `courier-book:${order.sourceOrderId}`,
    };

    const first = await queueCanonicalCourierBooking(context, input);
    const replay = await queueCanonicalCourierBooking(context, input);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.result.deliveryId).toBe(first.result.deliveryId);
    expect(await db.delivery.count()).toBe(1);
    expect(
      await db.outboxIntent.count({
        where: { effectType: "courier.shipment.create.v1" },
      }),
    ).toBe(1);
    expect(await getCanonicalCourierPosition(context, order.orderId)).toMatchObject({
      orderVersion: order.orderVersion + 1,
      deliveryState: "pending",
      delivery: { status: "booking_queued", provider: "yalidine" },
      effect: { state: "queued" },
    });
  });

  it("commits exact provider receipt and never repeats a succeeded effect", async () => {
    const { orderId } = await queuedBooking();
    let sends = 0;
    const sender = async () => {
      sends += 1;
      return {
        success: true,
        trackingId: "YAL-BOOK-1",
        labelUrl: "https://labels.example/YAL-BOOK-1.pdf",
        estimatedDelivery: "2026-08-04T10:00:00.000Z",
        cost: 650,
      };
    };

    expect(await drainDueCourierBookings(context, 10, sender)).toBe(1);
    expect(await drainDueCourierBookings(context, 10, sender)).toBe(0);
    expect(sends).toBe(1);

    const position = await getCanonicalCourierPosition(context, orderId);
    expect(position.delivery).toMatchObject({
      trackingNumber: "YAL-BOOK-1",
      status: "created",
      cost: 650,
    });
    expect(position.effect).toMatchObject({ state: "succeeded" });
    expect(position.availableActions).toContain("sync");
    expect(
      await db.canonicalDeliveryEvent.count({
        where: { eventType: "courier_booking_created" },
      }),
    ).toBe(1);
  });

  it("retries a known provider rejection without creating a duplicate shipment", async () => {
    const { booking } = await queuedBooking();
    let calls = 0;
    await drainDueCourierBookings(context, 1, async () => {
      calls += 1;
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: "Provider rejected address",
      };
    });

    const outbox = await db.outboxIntent.findUnique({
      where: { effectKey: booking.result.effectKey },
    });
    expect(calls).toBe(1);
    expect(outbox).toMatchObject({
      status: "retrying",
      outcomeState: "known_failure",
      lastErrorCode: "COURIER_PROVIDER_REJECTED_BOOKING",
    });
    expect(
      (await db.delivery.findUnique({ where: { id: booking.result.deliveryId } }))?.status,
    ).toBe("booking_retrying");
  });

  it("marks a thrown post-start provider outcome ambiguous and requires reconciliation", async () => {
    const { orderId, booking } = await queuedBooking();
    let calls = 0;
    await drainDueCourierBookings(context, 1, async () => {
      calls += 1;
      throw new Error("Connection lost after provider request");
    });
    expect(await drainDueCourierBookings(context, 1, async () => {
      calls += 1;
      throw new Error("must not run");
    })).toBe(0);
    expect(calls).toBe(1);

    const position = await getCanonicalCourierPosition(context, orderId);
    expect(position.delivery?.status).toBe("reconciliation_required");
    expect(position.effect).toMatchObject({
      state: "ambiguous",
      requiresReconciliation: true,
    });
    expect(position.availableActions).toEqual(
      expect.arrayContaining(["reconcile_created", "reconcile_not_created"]),
    );
    expect(
      await db.outboxIntent.findUnique({ where: { effectKey: booking.result.effectKey } }),
    ).toMatchObject({ outcomeState: "ambiguous" });
  });

  it("recovers an expired lease before provider effect without spending an attempt", async () => {
    const { booking } = await queuedBooking();
    const effect = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: booking.result.effectKey },
    });
    await db.outboxIntent.update({
      where: { id: effect.id },
      data: {
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(Date.now() - 300_000),
        leaseToken: "expired-lease",
        effectStartedAt: null,
      },
    });

    let calls = 0;
    await drainDueCourierBookings(context, 1, async () => {
      calls += 1;
      return { success: true, trackingId: "YAL-RECOVERED", cost: 600 };
    });

    expect(calls).toBe(1);
    expect(
      await db.outboxIntent.findUnique({ where: { id: effect.id } }),
    ).toMatchObject({ status: "succeeded", attemptCount: 1 });
  });

  it("manual not-created reconciliation restores booking eligibility", async () => {
    const { orderId, booking } = await queuedBooking();
    await drainDueCourierBookings(context, 1, async () => {
      throw new Error("Ambiguous booking");
    });
    const position = await getCanonicalCourierPosition(context, orderId);
    const reconciled = await reconcileCanonicalCourierBooking(context, {
      deliveryId: booking.result.deliveryId,
      action: "confirm_not_created",
      expectedVersion: position.orderVersion,
      reasonCode: "provider-dashboard-checked",
      idempotencyKey: `courier-reconcile-none:${orderId}`,
    });

    expect(reconciled.result).toMatchObject({
      orderVersion: position.orderVersion + 1,
      action: "confirm_not_created",
    });
    expect(await getCanonicalCourierPosition(context, orderId)).toMatchObject({
      deliveryState: "not_created",
      delivery: { status: "booking_failed" },
      availableActions: expect.arrayContaining(["book"]),
    });
  });

  it("pickup consumes exact reservations and delivery creates one COD receivable", async () => {
    const { orderId, booking } = await queuedBooking();
    await drainDueCourierBookings(context, 1, async () => ({
      success: true,
      trackingId: "YAL-LIFECYCLE-1",
      cost: 600,
    }));
    let position = await getCanonicalCourierPosition(context, orderId);

    const pickedUp = await ingestCanonicalCourierTrackingEvent(context, {
      deliveryId: booking.result.deliveryId,
      provider: "yalidine",
      providerEventId: "yal-pickup-1",
      status: "picked_up",
      occurredAt: "2026-07-31T08:00:00.000Z",
      reasonCode: "provider-yalidine-picked-up",
      expectedVersion: position.orderVersion,
      idempotencyKey: "courier-event:yal-pickup-1",
    });
    expect(pickedUp.result).toMatchObject({
      orderStatus: "shipped",
      deliveryState: "picked_up",
    });
    expect(
      await db.inventoryReservation.count({
        where: { orderId, state: "consumed" },
      }),
    ).toBe(1);

    position = await getCanonicalCourierPosition(context, orderId);
    const delivered = await ingestCanonicalCourierTrackingEvent(context, {
      deliveryId: booking.result.deliveryId,
      provider: "yalidine",
      providerEventId: "yal-delivered-1",
      status: "delivered",
      occurredAt: "2026-08-01T08:00:00.000Z",
      reasonCode: "provider-yalidine-delivered",
      expectedVersion: position.orderVersion,
      idempotencyKey: "courier-event:yal-delivered-1",
    });
    expect(delivered.result).toMatchObject({
      orderStatus: "delivered",
      deliveryState: "delivered",
    });
    expect(
      await db.financialMovement.count({
        where: { orderId, movementType: "cod_receivable_created" },
      }),
    ).toBe(1);
    expect((await db.order.findUnique({ where: { id: orderId } }))?.codState).toBe(
      "receivable",
    );
  });

  it("records but never applies an out-of-order tracking rollback", async () => {
    const { orderId, booking } = await queuedBooking();
    await drainDueCourierBookings(context, 1, async () => ({
      success: true,
      trackingId: "YAL-ORDERING-1",
      cost: 600,
    }));
    let position = await getCanonicalCourierPosition(context, orderId);
    const transit = await ingestCanonicalCourierTrackingEvent(context, {
      deliveryId: booking.result.deliveryId,
      provider: "yalidine",
      providerEventId: "yal-transit-new",
      status: "in_transit",
      occurredAt: "2026-08-01T08:00:00.000Z",
      reasonCode: "provider-yalidine-in-transit",
      expectedVersion: position.orderVersion,
      idempotencyKey: "courier-event:yal-transit-new",
    });
    position = await getCanonicalCourierPosition(context, orderId);
    const stale = await ingestCanonicalCourierTrackingEvent(context, {
      deliveryId: booking.result.deliveryId,
      provider: "yalidine",
      providerEventId: "yal-created-old",
      status: "created",
      occurredAt: "2026-07-31T07:00:00.000Z",
      reasonCode: "provider-yalidine-created",
      expectedVersion: position.orderVersion,
      idempotencyKey: "courier-event:yal-created-old",
    });

    expect(transit.result).toMatchObject({ deliveryState: "in_transit" });
    expect(stale.result).toMatchObject({ outOfOrder: true });
    expect((await getCanonicalCourierPosition(context, orderId)).delivery).toMatchObject({
      status: "in_transit",
    });
    expect(
      await db.canonicalDeliveryEvent.count({
        where: { eventType: "courier_tracking_ignored_out_of_order" },
      }),
    ).toBe(1);
  });
});
