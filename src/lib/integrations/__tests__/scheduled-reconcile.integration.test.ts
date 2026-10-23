process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getCanonicalCourierPosition } from "@/lib/delivery/canonical-courier-effect-runtime";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  canonicalSourceOrderSourceMetadata,
  trustedManualOrderSourceMetadata,
} from "@/lib/orders/manual-order-authority";
import { SahelFlowError } from "@/types/errors";
import {
  COURIER_PROVIDER_FAILURE_LIMIT,
  OPEN_COURIER_STATUSES,
  RECONCILE_INTERVAL_MS,
  newReconcileState,
  runScheduledReconcile,
  type ReconcileDeps,
} from "../scheduled-reconcile";

/**
 * INT-03: nothing pulled courier statuses or commerce orders on its own. These tests run the
 * scheduled cycle on a real SQLite database with the provider calls replaced by recorders, so
 * what is under test is WHICH work the cycle picks and how it behaves when a provider fails.
 */

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);
let sequence = 0;

async function clean(): Promise<void> {
  await db.delivery.deleteMany();
  await db.orderChange.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.customer.deleteMany();
  await db.integration.deleteMany();
}

async function seedDelivery(
  options: {
    status?: string;
    provider?: string;
    trackingNumber?: string | null;
    orderId?: string;
    sourceMetadata?: string | null;
    source?: string;
    deliveryDeleted?: boolean;
    orderDeleted?: boolean;
  } = {},
) {
  sequence += 1;
  const customer = await db.customer.create({
    data: {
      name: `Reconcile customer ${sequence}`,
      phone: `reconcile-phone-${sequence}`,
      nameBlindIndex: `reconcile-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Customer address",
    },
  });
  const order = await db.order.create({
    data: {
      ...(options.orderId ? { id: options.orderId } : {}),
      orderNumber: `ORD-REC-${sequence}`,
      status: "shipped",
      version: 1,
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "12 rue Didouche Mourad",
      phone: "0550123456",
      source: options.source ?? "manual",
      sourceMetadata:
        options.sourceMetadata === undefined
          ? trustedManualOrderSourceMetadata()
          : options.sourceMetadata,
      deletedAt: options.orderDeleted ? new Date() : null,
    },
  });
  const delivery = await db.delivery.create({
    data: {
      orderId: order.id,
      provider: options.provider ?? "yalidine",
      trackingNumber:
        options.trackingNumber === undefined
          ? `TRK-${sequence}`
          : options.trackingNumber,
      status: options.status ?? "in_transit",
      deletedAt: options.deliveryDeleted ? new Date() : null,
    },
  });
  return { order, delivery };
}

function recorder(overrides: Partial<ReconcileDeps> = {}) {
  const courierCalls: string[] = [];
  const commerceCalls: string[] = [];
  const deps: ReconcileDeps = {
    syncCourier: async (_context, orderId) => {
      courierCalls.push(orderId);
      return {};
    },
    queueCommerce: async (_context, platform) => {
      commerceCalls.push(platform);
      return {};
    },
    hasCommerceCredentials: async () => false,
    ...overrides,
  };
  return { deps, courierCalls, commerceCalls };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("scheduled courier reconciliation (INT-03)", () => {
  it("syncs every open canonical delivery that has a tracking number, and nothing else", async () => {
    const wanted = [
      await seedDelivery({ status: "created" }),
      await seedDelivery({ status: "picked_up" }),
      await seedDelivery({ status: "in_transit" }),
      await seedDelivery({ status: "at_hub" }),
      await seedDelivery({ status: "out_for_delivery" }),
      await seedDelivery({
        status: "in_transit",
        source: "storefront",
        sourceMetadata: canonicalSourceOrderSourceMetadata({
          source: "storefront",
          sourceIdentity: "shop-a",
          sourceOrderId: "receipt-1",
        }),
      }),
    ];
    // Everything below must be left alone.
    await seedDelivery({ status: "delivered" });
    await seedDelivery({ status: "returned" });
    await seedDelivery({ status: "failed" });
    await seedDelivery({ status: "pending" });
    await seedDelivery({ status: "booking_failed" });
    await seedDelivery({ status: "reconciliation_required" });
    await seedDelivery({ status: "in_transit", trackingNumber: null });
    await seedDelivery({ status: "in_transit", deliveryDeleted: true });
    await seedDelivery({ status: "in_transit", orderDeleted: true });
    await seedDelivery({ status: "in_transit", sourceMetadata: null });
    await seedDelivery({ status: "in_transit", orderId: "demo-order-1" });
    const { deps, courierCalls } = recorder();

    const report = await runScheduledReconcile(context, newReconcileState(), deps, {
      now: T0,
    });

    expect([...courierCalls].sort()).toEqual(wanted.map((w) => w.order.id).sort());
    expect(report.courier).toMatchObject({
      ran: true,
      attempted: 6,
      synced: 6,
      failed: 0,
    });
  });

  it("does nothing again until the interval has passed", async () => {
    await seedDelivery();
    const state = newReconcileState();
    const { deps, courierCalls } = recorder();

    const first = await runScheduledReconcile(context, state, deps, { now: T0 });
    const early = await runScheduledReconcile(context, state, deps, {
      now: T0 + RECONCILE_INTERVAL_MS - 1,
    });
    const due = await runScheduledReconcile(context, state, deps, {
      now: T0 + RECONCILE_INTERVAL_MS,
    });

    expect(first.courier.ran).toBe(true);
    expect(early.courier).toMatchObject({ ran: false, attempted: 0 });
    expect(due.courier.ran).toBe(true);
    expect(courierCalls).toHaveLength(2);
  });

  it("takes a bounded share per cycle, walks on from where it stopped and wraps round", async () => {
    const all = [];
    for (let index = 0; index < 5; index += 1) all.push(await seedDelivery());
    const state = newReconcileState();
    const cycles: string[][] = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const { deps, courierCalls } = recorder();
      await runScheduledReconcile(context, state, deps, {
        now: T0 + cycle * RECONCILE_INTERVAL_MS,
        courierPerCycle: 2,
      });
      cycles.push(courierCalls);
    }

    expect(cycles[0]).toHaveLength(2);
    expect(cycles[1]).toHaveLength(2);
    expect(cycles[2]).toHaveLength(1);
    const firstThree = cycles.slice(0, 3).flat();
    expect(new Set(firstThree).size).toBe(5);
    expect([...firstThree].sort()).toEqual(all.map((a) => a.order.id).sort());
    // After the last short page the walk starts again from the beginning.
    expect(cycles[3]).toEqual(cycles[0]);
  });

  it("keeps going when one delivery fails, and reports codes only", async () => {
    const a = await seedDelivery();
    const b = await seedDelivery();
    const c = await seedDelivery();
    const { deps, courierCalls } = recorder({
      syncCourier: async (_context, orderId) => {
        courierCalls.push(orderId);
        if (orderId === b.order.id) {
          throw new SahelFlowError(
            "secret customer 0550123456 at 12 rue Didouche Mourad",
            "PROVIDER_REJECTED",
            502,
          );
        }
        return {};
      },
    });

    const report = await runScheduledReconcile(context, newReconcileState(), deps, {
      now: T0,
    });

    expect(courierCalls).toHaveLength(3);
    expect(courierCalls).toEqual(expect.arrayContaining([a.order.id, c.order.id]));
    expect(report.courier).toMatchObject({ attempted: 3, synced: 2, failed: 1 });
    expect(report.courier.failureCodes).toEqual({ PROVIDER_REJECTED: 1 });
    const text = JSON.stringify(report);
    expect(text).not.toContain("0550123456");
    expect(text).not.toContain("Didouche");
    expect(text).not.toContain("secret");
  });

  it("stops calling a provider after repeated failures but carries on with the others", async () => {
    for (let index = 0; index < 5; index += 1) {
      await seedDelivery({ provider: "yalidine" });
    }
    const maystro = [
      await seedDelivery({ provider: "maystro" }),
      await seedDelivery({ provider: "maystro" }),
    ];
    const attempts: string[] = [];
    const { deps } = recorder({
      syncCourier: async (_context, orderId) => {
        const row = await db.delivery.findFirstOrThrow({ where: { orderId } });
        attempts.push(row.provider);
        if (row.provider === "yalidine") {
          throw new SahelFlowError("down", "PROVIDER_DOWN", 503);
        }
        return {};
      },
    });

    const report = await runScheduledReconcile(context, newReconcileState(), deps, {
      now: T0,
    });

    expect(attempts.filter((p) => p === "yalidine")).toHaveLength(
      COURIER_PROVIDER_FAILURE_LIMIT,
    );
    expect(attempts.filter((p) => p === "maystro")).toHaveLength(maystro.length);
    expect(report.courier.stoppedProviders).toEqual(["yalidine"]);
    expect(report.courier).toMatchObject({
      attempted: COURIER_PROVIDER_FAILURE_LIMIT + 2,
      synced: 2,
      failed: COURIER_PROVIDER_FAILURE_LIMIT,
    });
  });

  it("counts failures in a row, so a success in between starts the count again", async () => {
    // Five deliveries of one provider: fail, fail, ok, fail, fail. Never three in a row.
    for (let index = 0; index < 5; index += 1) await seedDelivery();
    let call = 0;
    const pattern = [true, true, false, true, true];
    const { deps } = recorder({
      syncCourier: async () => {
        const fails = pattern[call];
        call += 1;
        if (fails) throw new SahelFlowError("x", "PROVIDER_DOWN", 503);
        return {};
      },
    });

    const report = await runScheduledReconcile(context, newReconcileState(), deps, {
      now: T0,
    });

    expect(call).toBe(5);
    expect(report.courier.stoppedProviders).toEqual([]);
    expect(report.courier).toMatchObject({ attempted: 5, synced: 1, failed: 4 });
  });
});

describe("the list of open courier statuses agrees with the courier source of truth", () => {
  it.each([...OPEN_COURIER_STATUSES])("offers a sync for %s", async (status) => {
    const { order } = await seedDelivery({ status });
    const position = await getCanonicalCourierPosition(context, order.id);
    expect(position.availableActions).toContain("sync");
  });

  it.each([
    "pending",
    "delivered",
    "returned",
    "failed",
    "booking_failed",
    "reconciliation_required",
  ])("offers no sync for %s", async (status) => {
    const { order } = await seedDelivery({ status });
    const position = await getCanonicalCourierPosition(context, order.id);
    expect(position.availableActions).not.toContain("sync");
    expect(OPEN_COURIER_STATUSES as readonly string[]).not.toContain(status);
  });
});

describe("scheduled commerce pull (INT-03)", () => {
  it("queues a sync only for platforms that have saved credentials", async () => {
    const { deps, commerceCalls } = recorder({
      hasCommerceCredentials: async (_context, platform) => platform !== "youcan",
    });

    const report = await runScheduledReconcile(context, newReconcileState(), deps, {
      now: T0,
    });

    expect(commerceCalls.sort()).toEqual(["shopify", "woocommerce"]);
    expect(report.commerce.queued.sort()).toEqual(["shopify", "woocommerce"]);
  });

  it("does not queue the same platform again before the interval", async () => {
    const state = newReconcileState();
    const { deps, commerceCalls } = recorder({
      hasCommerceCredentials: async (_context, platform) => platform === "shopify",
    });

    await runScheduledReconcile(context, state, deps, { now: T0 });
    await runScheduledReconcile(context, state, deps, { now: T0 + 60_000 });
    await runScheduledReconcile(context, state, deps, {
      now: T0 + RECONCILE_INTERVAL_MS,
    });

    expect(commerceCalls).toEqual(["shopify", "shopify"]);
  });

  it("leaves a platform alone that synced recently, by hand or on its own", async () => {
    await db.integration.create({
      data: {
        platform: "shopify",
        type: "E-commerce",
        isActive: true,
        config: "{}",
        lastSyncAt: new Date(T0 - 60_000),
      },
    });
    await db.integration.create({
      data: {
        platform: "woocommerce",
        type: "E-commerce",
        isActive: true,
        config: "{}",
        lastSyncAt: new Date(T0 - 2 * RECONCILE_INTERVAL_MS),
      },
    });
    const { deps, commerceCalls } = recorder({
      hasCommerceCredentials: async () => true,
    });

    await runScheduledReconcile(context, newReconcileState(), deps, { now: T0 });

    expect(commerceCalls.sort()).toEqual(["woocommerce", "youcan"]);
  });

  it("keeps going when one platform cannot be queued, and reports codes only", async () => {
    const { deps, commerceCalls } = recorder({
      hasCommerceCredentials: async () => true,
      queueCommerce: async (_context, platform) => {
        commerceCalls.push(platform);
        if (platform === "woocommerce") {
          throw new SahelFlowError(
            "https://shop.example.com/?consumer_key=ck_secret",
            "COMMERCE_SYNC_CREDENTIALS_MISSING",
            409,
          );
        }
        return {};
      },
    });

    const report = await runScheduledReconcile(context, newReconcileState(), deps, {
      now: T0,
    });

    expect(commerceCalls.sort()).toEqual(["shopify", "woocommerce", "youcan"]);
    expect(report.commerce.queued.sort()).toEqual(["shopify", "youcan"]);
    expect(report.commerce.failed).toBe(1);
    expect(report.commerce.failureCodes).toEqual({
      COMMERCE_SYNC_CREDENTIALS_MISSING: 1,
    });
    expect(JSON.stringify(report)).not.toContain("ck_secret");
  });

  it("a failing platform is retried only after the interval, not on every tick", async () => {
    const state = newReconcileState();
    const { deps, commerceCalls } = recorder({
      hasCommerceCredentials: async (_context, platform) => platform === "shopify",
      queueCommerce: async (_context, platform) => {
        commerceCalls.push(platform);
        throw new SahelFlowError("x", "PROVIDER_DOWN", 503);
      },
    });

    await runScheduledReconcile(context, state, deps, { now: T0 });
    await runScheduledReconcile(context, state, deps, { now: T0 + 60_000 });
    await runScheduledReconcile(context, state, deps, { now: T0 + 120_000 });

    expect(commerceCalls).toEqual(["shopify"]);
  });
});
