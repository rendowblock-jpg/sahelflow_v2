import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
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

/**
 * NEW-CARRIER-WILAYA-CODE: the booking request the courier adapters receive. A hosted-storefront order stores the
 * wilaya as a 2-digit code ("05"); EcoTrack and ZR compare it with String(5) and Yalidine sends it as a wilaya NAME.
 * The request must carry the wilaya's French name, and a wilaya created by Loi 26-06 (59..69) its mother's name.
 */

let db: PrismaClient;
let context: BusinessPrincipalContext;

beforeEach(async () => {
  db = await createTestPrisma();
  context = {
    prisma: db as never,
    shop: TEST_SHOP_CONTEXT,
    businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("wilaya-owner"),
  };
});

/**
 * This file books canonical orders, so it leaves BusinessCommand, InventoryReservation, InventoryMovement and
 * CanonicalDeliveryEvent rows behind. The WhatsApp integration tests (inbound-worker, durable-daily-whatsapp) wipe
 * BusinessCommand in their own clean(); on a shared test database that failed with a foreign-key error whenever this
 * file ran first. Delete what we wrote, children before parents, so file order does not matter.
 */
async function removeBookingLeftovers(): Promise<void> {
  await db.canonicalDeliveryEvent.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.inventoryReservation.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
}

afterEach(async () => {
  await removeBookingLeftovers();
  await disconnectTestPrisma(db);
});

/** Queue a booking for a ready order whose wilaya is stored as `wilaya`; return the wilaya the courier request carries. */
async function bookedWilaya(wilaya: string): Promise<string> {
  const category = await db.category.create({ data: { name: `Wilaya ${randomUUID()}` } });
  const product = await db.product.create({
    data: {
      name: `Wilaya Product ${randomUUID()}`,
      price: 2500,
      cost: 1200,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });
  const sourceOrderId = randomUUID();
  const created = await createCanonicalSourceOrder(context, {
    idempotencyKey: `wilaya-source:${sourceOrderId}`,
    source: "storefront",
    sourceIdentity: "wilaya-test-store",
    sourceOrderId,
    newCustomer: { name: "Wilaya Customer", phone: "0555123456", wilaya, commune: "Bab Ezzouar", address: "12 Rue des Freres" },
    items: [{ productId: product.id, quantity: 1 }],
    wilaya,
    commune: "Bab Ezzouar",
    address: "12 Rue des Freres",
    phone: "0555123456",
    deliveryCost: 400,
  });
  const confirmed = await executeManualOrderDecision(context, {
    orderId: created.result.order.id,
    decision: "confirm",
    expectedVersion: created.result.order.version,
    idempotencyKey: `wilaya-confirm:${sourceOrderId}`,
  });
  const packed = await executeCanonicalFulfillment(context, {
    orderId: created.result.order.id,
    action: "pack",
    expectedVersion: confirmed.result.version,
    idempotencyKey: `wilaya-pack:${sourceOrderId}`,
  });
  await queueCanonicalCourierBooking(context, {
    orderId: created.result.order.id,
    provider: "yalidine",
    expectedVersion: packed.result.version,
    idempotencyKey: `wilaya-book:${sourceOrderId}`,
  });
  const outbox = await db.outboxIntent.findFirstOrThrow({ where: { effectType: "courier.shipment.create.v1" } });
  const payload = openBusinessPayloadWithKey<{ request: { customer: { wilaya: string } } }>(
    outbox.payloadJson,
    { kind: "outbox-intent" as const, recordKey: outbox.effectKey, recordType: outbox.effectType, commandId: outbox.commandId },
    await getBusinessEnvelopeKey(context),
  );
  return payload.request.customer.wilaya;
}

describe("the wilaya the courier request carries", () => {
  it("is the French name when the order stored a 2-digit code, padded or not", async () => {
    expect(await bookedWilaya("05")).toBe("Batna");
  });

  it("is unchanged when the order stored a name", async () => {
    expect(await bookedWilaya("Alger")).toBe("Alger");
  });

  it("is the mother wilaya's name for a wilaya created by Loi 26-06 (Aflou is 59, formerly in Laghouat)", async () => {
    expect(await bookedWilaya("59")).toBe("Laghouat");
  });

  it("is unchanged for text it does not recognise", async () => {
    expect(await bookedWilaya("Atlantis")).toBe("Atlantis");
  });
});
