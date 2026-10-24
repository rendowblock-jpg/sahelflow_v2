/**
 * POST /api/delivery/sync is the front door of the Deliveries screen. A
 * canonical (kernel) order must go through the same canonical sync function as
 * POST /api/orders/[id]/courier/sync; a legacy order keeps the old status copy.
 *
 * No real courier account is used: the adapter is a mock that answers per
 * tracking number, and the orders run through the real canonical commands on
 * the test database.
 */
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getJson, mockPost } from "@/app/api/__tests__/helpers";
import {
  testAuthenticatedOwnerBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import {
  createTestPrisma,
  teardownTestPrisma,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import {
  drainDueCourierBookings,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
  queueCanonicalCourierBooking,
} from "@/lib/delivery/canonical-courier";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";

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

// Only the adapter and credentials are faked. The demo guard stays real.
vi.mock("@/lib/integrations/delivery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/delivery")>()),
  getDeliveryAdapter: vi.fn(() => mockAdapter),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

// The sibling route asks for a trusted actor; the test has no signed-in session.
vi.mock("@/lib/identity/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/identity/authorization")>()),
  requireTrustedAction: vi.fn(async () => ({})),
}));

vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

import { POST as POSTCourierSync } from "@/app/api/orders/[id]/courier/sync/route";
import { POST as POSTSync } from "@/app/api/delivery/sync/route";

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let db: PrismaClient;
let context: BusinessPrincipalContext;
let counter = 0;

beforeEach(async () => {
  db = await createTestPrisma();
  context = {
    prisma: db as never,
    shop: TEST_SHOP_CONTEXT,
    businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("sync-owner"),
  };
  mockAdapter.syncTracking.mockReset();
});

afterEach(async () => {
  await teardownTestPrisma(db);
});

/** The provider answers with one event per call, keyed by tracking number. */
function providerAnswers(status: string, timestamp = "2026-08-02T08:00:00.000Z") {
  mockAdapter.syncTracking.mockImplementation(async (trackingNumber: string) => ({
    trackingId: trackingNumber,
    status,
    estimatedDelivery: null,
    deliveryCompany: "Yalidine",
    events: [{ status, timestamp, details: `provider says ${status}` }],
  }));
}

/** A canonical order, booked and already in transit, built with the real commands. */
async function canonicalInTransitOrder() {
  const label = `T${++counter}-${randomUUID().slice(0, 8)}`;
  const category = await db.category.create({ data: { name: `Cat ${label}` } });
  const product = await db.product.create({
    data: {
      name: `Product ${label}`,
      price: 2500,
      cost: 1200,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });
  const sourceOrderId = randomUUID();
  const created = await createCanonicalSourceOrder(context, {
    idempotencyKey: `sync-source:${sourceOrderId}`,
    source: "storefront",
    sourceIdentity: "sync-test-store",
    sourceOrderId,
    newCustomer: {
      name: "Sync Customer",
      phone: "0555123456",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Sync Street",
    },
    items: [{ productId: product.id, quantity: 2 }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "1 Sync Street",
    phone: "0555123456",
    deliveryCost: 500,
  });
  const orderId = created.result.order.id;
  const confirmed = await executeManualOrderDecision(context, {
    orderId,
    decision: "confirm",
    expectedVersion: created.result.order.version,
    idempotencyKey: `sync-confirm:${sourceOrderId}`,
  });
  const packed = await executeCanonicalFulfillment(context, {
    orderId,
    action: "pack",
    expectedVersion: confirmed.result.version,
    idempotencyKey: `sync-pack:${sourceOrderId}`,
  });
  const booking = await queueCanonicalCourierBooking(context, {
    orderId,
    provider: "yalidine",
    expectedVersion: packed.result.version,
    idempotencyKey: `sync-book:${sourceOrderId}`,
  });
  const trackingNumber = `YAL-${label}`;
  await drainDueCourierBookings(context, 1, async () => ({
    success: true,
    trackingId: trackingNumber,
    cost: 600,
  }));
  const booked = await getCanonicalCourierPosition(context, orderId);
  await ingestCanonicalCourierTrackingEvent(context, {
    deliveryId: booking.result.deliveryId,
    provider: "yalidine",
    providerEventId: `seed-transit-${label}`,
    status: "in_transit",
    occurredAt: "2026-08-01T08:00:00.000Z",
    reasonCode: "provider-yalidine-in-transit",
    expectedVersion: booked.orderVersion,
    idempotencyKey: `courier-event:seed-transit-${label}`,
  });
  return { orderId, deliveryId: booking.result.deliveryId, trackingNumber };
}

/** What the kernel recorded for one order, without ids, times or tracking numbers. */
async function recorded(orderId: string) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { delivery: true },
  });
  const events = await db.canonicalDeliveryEvent.findMany({
    where: { orderId },
    orderBy: [{ occurredAt: "asc" }, { eventType: "asc" }],
  });
  return {
    order: {
      status: order.status,
      fulfillmentState: order.fulfillmentState,
      deliveryState: order.deliveryState,
      inventoryState: order.inventoryState,
      codState: order.codState,
      returnState: order.returnState,
    },
    deliveryStatus: order.delivery?.status,
    events: events.map((event) => ({
      eventType: event.eventType,
      provider: event.provider,
    })),
    returnCases: await db.canonicalReturnCase.count({ where: { orderId } }),
  };
}

/** An order written straight into the table: legacy, or canonical when asked. */
async function seedPlainOrder(opts: {
  orderId?: string;
  deliveryId?: string;
  canonical?: boolean;
}) {
  counter += 1;
  const customer = await db.customer.create({
    data: {
      name: `Plain Cust ${counter}`,
      phone: `0556${String(counter).padStart(6, "0")}`,
      nameBlindIndex: `plain-cust-blind-${counter}-${randomUUID()}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
    },
  });
  const order = await db.order.create({
    data: {
      ...(opts.orderId ? { id: opts.orderId } : {}),
      orderNumber: `ORD-SYNC-${counter}-${randomUUID().slice(0, 6)}`,
      status: "shipped",
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555000001",
      source: "manual",
      sourceMetadata: opts.canonical
        ? JSON.stringify({ authority: "trusted-manual-v1" })
        : null,
      confirmedAt: new Date(),
      shippedAt: new Date(),
    },
  });
  const delivery = await db.delivery.create({
    data: {
      ...(opts.deliveryId ? { id: opts.deliveryId } : {}),
      orderId: order.id,
      provider: "yalidine",
      trackingNumber: `YAL-PLAIN-${counter}`,
      cost: 600,
      status: "in_transit",
    },
  });
  return { order, delivery };
}

describe("POST /api/delivery/sync — canonical orders use the canonical sync", () => {
  it("canonical order sync from the Deliveries endpoint gives the same delivery events and order status as /orders/[id]/courier/sync", async () => {
    const viaDeliveries = await canonicalInTransitOrder();
    const viaOrders = await canonicalInTransitOrder();
    providerAnswers("out_for_delivery");

    const first = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", {
        deliveryId: viaDeliveries.deliveryId,
      }),
    );
    const second = await POSTCourierSync(
      mockPost(`http://localhost/api/orders/${viaOrders.orderId}/courier/sync`, {}),
      { params: Promise.resolve({ id: viaOrders.orderId }) },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = await recorded(viaDeliveries.orderId);
    const b = await recorded(viaOrders.orderId);
    expect(a.events.map((e) => e.eventType)).toContain("courier_tracking_out_for_delivery");
    expect(a.order).toEqual(b.order);
    expect(a.deliveryStatus).toBe(b.deliveryStatus);
    expect(a.returnCases).toBe(b.returnCases);
    expect(a.events).toEqual(b.events);
  });

  it("canonical refused parcel creates a delivery exception and does not write the raw status", async () => {
    const { orderId, deliveryId } = await canonicalInTransitOrder();
    providerAnswers("refused");

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId }),
    );

    expect(res.status).toBe(200);
    const after = await recorded(orderId);
    // The kernel opened the exception: a refusal event and a return case.
    expect(after.events.map((e) => e.eventType)).toContain("delivery.refused.v1");
    expect(after.returnCases).toBe(1);
    expect(after.order.deliveryState).not.toBe("in_transit");
    expect(after.deliveryStatus).toBe("refused");
    // A raw copy would have left the order untouched; the order stays shipped
    // and its stock / money state moved only through the kernel.
    expect(after.order.status).toBe("shipped");
    expect(after.order.inventoryState).not.toBe("outbound");
  });

  it("legacy order keeps today's behaviour", async () => {
    const { order, delivery } = await seedPlainOrder({});
    providerAnswers("delivered");

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
    );

    expect(res.status).toBe(200);
    expect((await getJson(res)).status).toBe("delivered");
    expect(
      (await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).status,
    ).toBe("delivered");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe("delivered");
    expect(await db.canonicalDeliveryEvent.count({ where: { orderId: order.id } })).toBe(0);

    // A refused parcel on a legacy order is still only copied to the delivery.
    const refused = await seedPlainOrder({});
    providerAnswers("refused");
    const refusedRes = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId: refused.delivery.id }),
    );
    expect(refusedRes.status).toBe(200);
    expect(
      (await db.delivery.findUniqueOrThrow({ where: { id: refused.delivery.id } })).status,
    ).toBe("refused");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: refused.order.id } })).status,
    ).toBe("shipped");
    expect(await db.canonicalReturnCase.count({ where: { orderId: refused.order.id } })).toBe(0);
  });

  it("demo order never calls the provider", async () => {
    providerAnswers("delivered");
    const cases = [
      // The order carries the demo tag, the delivery id does not.
      { orderId: "demo-order-canonical-1", deliveryId: "real-delivery-1" },
      // The delivery id carries the demo tag.
      { orderId: "real-order-canonical-2", deliveryId: "demo-delivery-2" },
    ];
    for (const ids of cases) {
      const { delivery } = await seedPlainOrder({ ...ids, canonical: true });
      const res = await POSTSync(
        mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }),
      );
      expect(res.status).toBe(409);
      expect((await getJson(res)).code).toBe("DEMO_PROVIDER_EFFECT_BLOCKED");
    }
    expect(mockAdapter.syncTracking).not.toHaveBeenCalled();
  });

  it("response shape keeps ok/status/events/estimatedDelivery", async () => {
    const { orderId, deliveryId } = await canonicalInTransitOrder();
    providerAnswers("out_for_delivery");

    const res = await POSTSync(
      mockPost("http://localhost/api/delivery/sync", { deliveryId }),
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.ok).toBe(true);
    // The Deliveries callers read ok and status; the status is what is stored now.
    expect(body.status).toBe(
      (await db.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).status,
    );
    expect(body.status).toBe("out_for_delivery");
    const events = body.events;
    expect(Array.isArray(events)).toBe(true);
    expect((events as unknown[]).length).toBeGreaterThan(0);
    expect(body).toHaveProperty("estimatedDelivery");
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe("shipped");
  });
});
