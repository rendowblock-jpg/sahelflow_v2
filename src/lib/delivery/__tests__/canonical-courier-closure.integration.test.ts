import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

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
    businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
      "courier-closure-owner",
    ),
  };
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function readyOrder(label: string = randomUUID()) {
  const category = await db.category.create({
    data: { name: `Courier Closure ${label}` },
  });
  const product = await db.product.create({
    data: {
      name: `Courier Closure Product ${label}`,
      price: 2500,
      cost: 1200,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });
  const sourceOrderId = randomUUID();
  const created = await createCanonicalSourceOrder(context, {
    idempotencyKey: `courier-closure-source:${sourceOrderId}`,
    source: "storefront",
    sourceIdentity: "courier-closure-store",
    sourceOrderId,
    newCustomer: {
      name: "Courier Closure Customer",
      phone: "0555123456",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Closure Street",
    },
    items: [{ productId: product.id, quantity: 2 }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "1 Closure Street",
    phone: "0555123456",
    deliveryCost: 500,
  });
  const confirmed = await executeManualOrderDecision(context, {
    orderId: created.result.order.id,
    decision: "confirm",
    expectedVersion: created.result.order.version,
    idempotencyKey: `courier-closure-confirm:${sourceOrderId}`,
  });
  const packed = await executeCanonicalFulfillment(context, {
    orderId: created.result.order.id,
    action: "pack",
    expectedVersion: confirmed.result.version,
    idempotencyKey: `courier-closure-pack:${sourceOrderId}`,
  });

  return {
    orderId: created.result.order.id,
    orderVersion: packed.result.version,
    sourceOrderId,
  };
}

async function firstBooking(label: string = randomUUID()) {
  const order = await readyOrder(label);
  const input = {
    orderId: order.orderId,
    provider: "yalidine" as const,
    expectedVersion: order.orderVersion,
    idempotencyKey: `courier-closure-book:${order.sourceOrderId}`,
  };
  const booking = await queueCanonicalCourierBooking(context, input);
  return { ...order, input, booking };
}

async function makeDue(effectKey: string): Promise<void> {
  await db.outboxIntent.update({
    where: { effectKey },
    data: { nextAttemptAt: new Date(0) },
  });
}

async function makeAmbiguous(): Promise<never> {
  throw new Error("Provider connection ended after request write");
}

describe("canonical courier Phase 1 closure", () => {
  it("rebooks one reconciled order generation, rejects a concurrent duplicate, and preserves original-key replay", async () => {
    const { orderId, input, booking } = await firstBooking("rebook");

    await drainDueCourierBookings(context, 1, makeAmbiguous);
    const ambiguous = await getCanonicalCourierPosition(context, orderId);
    expect(ambiguous.effect).toMatchObject({
      state: "ambiguous",
      requiresReconciliation: true,
    });

    await reconcileCanonicalCourierBooking(context, {
      deliveryId: booking.result.deliveryId,
      action: "confirm_not_created",
      expectedVersion: ambiguous.orderVersion,
      reasonCode: "provider-dashboard-checked",
      idempotencyKey: `courier-closure-reconcile:${orderId}`,
    });
    const recovered = await getCanonicalCourierPosition(context, orderId);
    expect(recovered).toMatchObject({
      deliveryState: "not_created",
      delivery: { status: "booking_failed" },
      availableActions: expect.arrayContaining(["book"]),
    });

    const attempts = await Promise.allSettled([
      queueCanonicalCourierBooking(context, {
        orderId,
        provider: "yalidine",
        expectedVersion: recovered.orderVersion,
        idempotencyKey: `courier-closure-rebook-a:${orderId}`,
      }),
      queueCanonicalCourierBooking(context, {
        orderId,
        provider: "yalidine",
        expectedVersion: recovered.orderVersion,
        idempotencyKey: `courier-closure-rebook-b:${orderId}`,
      }),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);

    const winner = attempts.find(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof queueCanonicalCourierBooking>>
      > => attempt.status === "fulfilled",
    );
    expect(winner).toBeDefined();
    expect(winner?.value.result.deliveryId).toBe(booking.result.deliveryId);

    const replay = await queueCanonicalCourierBooking(context, input);
    expect(replay.replayed).toBe(true);
    expect(replay.result.deliveryId).toBe(booking.result.deliveryId);

    let sends = 0;
    expect(
      await drainDueCourierBookings(context, 2, async () => {
        sends += 1;
        return {
          success: true,
          trackingId: "YAL-REBOOKED-1",
          cost: 600,
        };
      }),
    ).toBe(1);
    expect(sends).toBe(1);
    expect(await db.delivery.count()).toBe(1);
    expect(
      await db.outboxIntent.count({
        where: { effectType: "courier.shipment.create.v1" },
      }),
    ).toBe(2);
    expect(await getCanonicalCourierPosition(context, orderId)).toMatchObject({
      delivery: {
        id: booking.result.deliveryId,
        trackingNumber: "YAL-REBOOKED-1",
        status: "created",
      },
      effect: { state: "succeeded" },
    });
  });

  it("supports the same reconciliation action on a later booking generation", async () => {
    const { orderId, booking } = await firstBooking("repeat-reconcile");

    await drainDueCourierBookings(context, 1, makeAmbiguous);
    let position = await getCanonicalCourierPosition(context, orderId);
    const first = await reconcileCanonicalCourierBooking(context, {
      deliveryId: booking.result.deliveryId,
      action: "confirm_not_created",
      expectedVersion: position.orderVersion,
      reasonCode: "provider-dashboard-checked-first",
      idempotencyKey: `courier-closure-reconcile-first:${orderId}`,
    });
    expect(first.replayed).toBe(false);

    position = await getCanonicalCourierPosition(context, orderId);
    const secondBooking = await queueCanonicalCourierBooking(context, {
      orderId,
      provider: "yalidine",
      expectedVersion: position.orderVersion,
      idempotencyKey: `courier-closure-repeat-book:${orderId}`,
    });
    expect(secondBooking.result.deliveryId).toBe(booking.result.deliveryId);

    await drainDueCourierBookings(context, 1, makeAmbiguous);
    position = await getCanonicalCourierPosition(context, orderId);
    const second = await reconcileCanonicalCourierBooking(context, {
      deliveryId: booking.result.deliveryId,
      action: "confirm_not_created",
      expectedVersion: position.orderVersion,
      reasonCode: "provider-dashboard-checked-second",
      idempotencyKey: `courier-closure-reconcile-second:${orderId}`,
    });

    expect(second.replayed).toBe(false);
    expect(second.result).toMatchObject({
      action: "confirm_not_created",
      orderVersion: position.orderVersion + 1,
      deliveryId: booking.result.deliveryId,
    });
    expect(
      await db.businessCommand.count({
        where: {
          commandType: "courier.booking.reconcile.confirm_not_created.v1",
        },
      }),
    ).toBe(2);
    expect(await getCanonicalCourierPosition(context, orderId)).toMatchObject({
      deliveryState: "not_created",
      delivery: { status: "booking_failed" },
      availableActions: expect.arrayContaining(["book"]),
    });
  });

  it("turns terminal known rejection into a governed bookable state before a later generation", async () => {
    const { orderId, booking } = await firstBooking("terminal");
    let sends = 0;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await makeDue(booking.result.effectKey);
      expect(
        await drainDueCourierBookings(context, 1, async () => {
          sends += 1;
          return {
            success: false,
            trackingId: "",
            cost: 0,
            error: "Provider rejected the address",
          };
        }),
      ).toBe(1);
    }

    expect(sends).toBe(5);
    expect(
      await db.outboxIntent.findUnique({
        where: { effectKey: booking.result.effectKey },
      }),
    ).toMatchObject({
      status: "dead_letter",
      outcomeState: "known_failure",
      lastErrorCode: "COURIER_PROVIDER_REJECTED_BOOKING",
      attemptCount: 5,
    });

    const recovered = await getCanonicalCourierPosition(context, orderId);
    expect(recovered).toMatchObject({
      deliveryState: "not_created",
      delivery: { status: "booking_failed" },
      availableActions: expect.arrayContaining(["book"]),
    });

    const rebooked = await queueCanonicalCourierBooking(context, {
      orderId,
      provider: "yalidine",
      expectedVersion: recovered.orderVersion,
      idempotencyKey: `courier-closure-terminal-rebook:${orderId}`,
    });
    expect(rebooked.result.deliveryId).toBe(booking.result.deliveryId);
    expect(rebooked.replayed).toBe(false);
  });

  it("treats a provider success without tracking identity as ambiguous and never retries it", async () => {
    const { orderId, booking } = await firstBooking("missing-tracking");
    let sends = 0;

    expect(
      await drainDueCourierBookings(context, 1, async () => {
        sends += 1;
        return {
          success: true,
          trackingId: "",
          cost: 600,
        };
      }),
    ).toBe(1);
    expect(
      await drainDueCourierBookings(context, 1, async () => {
        sends += 1;
        throw new Error("must never retry an ambiguous provider success");
      }),
    ).toBe(0);
    expect(sends).toBe(1);

    expect(
      await db.outboxIntent.findUnique({
        where: { effectKey: booking.result.effectKey },
      }),
    ).toMatchObject({
      status: "failed",
      outcomeState: "ambiguous",
      lastErrorCode: "COURIER_MISSING_TRACKING_RECEIPT",
    });
    expect(await getCanonicalCourierPosition(context, orderId)).toMatchObject({
      delivery: { status: "reconciliation_required" },
      effect: { state: "ambiguous", requiresReconciliation: true },
      availableActions: expect.arrayContaining([
        "reconcile_created",
        "reconcile_not_created",
      ]),
    });
  });

  it("dead-letters a corrupt pre-effect payload, restores its order, and continues later due work", async () => {
    const corrupt = await firstBooking("corrupt");
    const healthy = await firstBooking("healthy");

    await db.outboxIntent.update({
      where: { effectKey: corrupt.booking.result.effectKey },
      data: { payloadJson: "not-a-valid-sealed-business-payload" },
    });

    let sends = 0;
    expect(
      await drainDueCourierBookings(context, 2, async () => {
        sends += 1;
        return {
          success: true,
          trackingId: "YAL-HEALTHY-AFTER-POISON",
          cost: 650,
        };
      }),
    ).toBe(2);
    expect(sends).toBe(1);

    expect(
      await db.outboxIntent.findUnique({
        where: { effectKey: corrupt.booking.result.effectKey },
      }),
    ).toMatchObject({
      status: "dead_letter",
      outcomeState: "known_failure",
      lastErrorCode: "COURIER_INVALID_OUTBOX_PAYLOAD",
    });
    expect(
      await getCanonicalCourierPosition(context, corrupt.orderId),
    ).toMatchObject({
      deliveryState: "not_created",
      delivery: { status: "booking_failed" },
      availableActions: expect.arrayContaining(["book"]),
    });
    expect(
      await getCanonicalCourierPosition(context, healthy.orderId),
    ).toMatchObject({
      delivery: {
        trackingNumber: "YAL-HEALTHY-AFTER-POISON",
        status: "created",
      },
      effect: { state: "succeeded" },
    });
    expect(
      await db.auditLog.count({
        where: {
          action: "courier.booking.outcome.terminal_failure.v1",
          entityId: (
            await db.outboxIntent.findUniqueOrThrow({
              where: { effectKey: corrupt.booking.result.effectKey },
            })
          ).id,
        },
      }),
    ).toBe(1);
  });

  it("makes an unreadable expired post-effect lease manually reconcilable", async () => {
    const { orderId, booking } = await firstBooking("post-effect-corrupt");
    const effect = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: booking.result.effectKey },
    });
    await db.outboxIntent.update({
      where: { id: effect.id },
      data: {
        payloadJson: "not-a-valid-sealed-business-payload",
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(Date.now() - 300_000),
        leaseToken: "expired-post-effect-lease",
        effectStartedAt: new Date(Date.now() - 240_000),
      },
    });

    let sends = 0;
    expect(
      await drainDueCourierBookings(context, 1, async () => {
        sends += 1;
        throw new Error("must not repeat an expired post-effect request");
      }),
    ).toBe(0);
    expect(sends).toBe(0);

    const position = await getCanonicalCourierPosition(context, orderId);
    expect(position).toMatchObject({
      delivery: { status: "reconciliation_required" },
      effect: {
        state: "ambiguous",
        errorCode:
          "COURIER_EFFECT_LEASE_EXPIRED_AFTER_START_PAYLOAD_UNREADABLE",
        requiresReconciliation: true,
      },
      availableActions: expect.arrayContaining([
        "reconcile_created",
        "reconcile_not_created",
      ]),
    });

    const reconciled = await reconcileCanonicalCourierBooking(context, {
      deliveryId: booking.result.deliveryId,
      action: "confirm_not_created",
      expectedVersion: position.orderVersion,
      reasonCode: "provider-dashboard-checked-after-corruption",
      idempotencyKey: `courier-closure-post-effect-reconcile:${orderId}`,
    });
    expect(reconciled.result).toMatchObject({
      action: "confirm_not_created",
      orderVersion: position.orderVersion + 1,
    });
    expect(await getCanonicalCourierPosition(context, orderId)).toMatchObject({
      deliveryState: "not_created",
      delivery: { status: "booking_failed" },
      availableActions: expect.arrayContaining(["book"]),
    });
  });
});

describe("canonical courier public boundary", () => {
  it("keeps the preserved implementation private behind the governed facade", () => {
    const roots = [
      resolve(process.cwd(), "src"),
      resolve(process.cwd(), "scripts"),
    ];
    const allowed = new Set([
      resolve(process.cwd(), "src/lib/delivery/canonical-courier.ts"),
      resolve(
        process.cwd(),
        "src/lib/delivery/canonical-courier-booking-authority.ts",
      ),
      resolve(
        process.cwd(),
        "src/lib/delivery/canonical-courier-effect-runtime.ts",
      ),
      resolve(
        process.cwd(),
        "src/lib/delivery/__tests__/canonical-courier-closure.integration.test.ts",
      ),
      resolve(
        process.cwd(),
        "src/lib/integrations/delivery/__tests__/provider-authority-source-contract.test.ts",
      ),
      resolve(
        process.cwd(),
        "src/lib/integrations/__tests__/phase3-source-closure.test.ts",
      ),
    ]);
    const offenders: string[] = [];

    const walk = (directory: string): void => {
      if (!existsSync(directory)) return;
      for (const name of readdirSync(directory)) {
        const path = resolve(directory, name);
        const metadata = statSync(path);
        if (metadata.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(name) || allowed.has(path)) {
          continue;
        }
        const content = readFileSync(path, "utf8");
        if (
          content.includes("canonical-courier-effect-runtime") ||
          content.includes("canonical-courier-booking-authority")
        ) {
          offenders.push(path.replace(`${process.cwd()}\\`, ""));
        }
      }
    };

    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
