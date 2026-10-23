process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import {
  AUTO_PULL_COMMERCE_KEY,
  AUTO_PULL_COURIER_KEY,
  RECONCILE_INTERVAL_MS,
  loadAutoPullSwitches,
  newReconcileState,
  runScheduledReconcile,
  type ReconcileDeps,
} from "../scheduled-reconcile";

/**
 * INT-03 off switch. The scheduled pull is ON by default, so a seller who does not want the app to
 * ask couriers and shops by itself needs a way to say so. Two stored settings, one for couriers and
 * one for shops. Only the exact text "false" turns one off: a damaged or unknown value leaves the
 * pull ON, which is the default the seller was told about.
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
  await db.setting.deleteMany({
    where: { key: { in: [AUTO_PULL_COURIER_KEY, AUTO_PULL_COMMERCE_KEY] } },
  });
}

async function setSwitch(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.setting.deleteMany({ where: { key } });
    return;
  }
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function seedOpenDelivery() {
  sequence += 1;
  const customer = await db.customer.create({
    data: {
      name: `Switch customer ${sequence}`,
      phone: `switch-phone-${sequence}`,
      nameBlindIndex: `switch-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Customer address",
    },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-SW-${sequence}`,
      status: "shipped",
      version: 1,
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "12 rue Didouche Mourad",
      phone: "0550123456",
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
    },
  });
  await db.delivery.create({
    data: {
      orderId: order.id,
      provider: "yalidine",
      trackingNumber: `TRK-SW-${sequence}`,
      status: "in_transit",
    },
  });
  return order;
}

function recorder() {
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
    hasCommerceCredentials: async (_context, platform) => platform === "shopify",
  };
  return { deps, courierCalls, commerceCalls };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("loadAutoPullSwitches", () => {
  it("is ON for both when nothing is stored", async () => {
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: true, commerce: true });
  });

  it("reads the two switches independently", async () => {
    await setSwitch(AUTO_PULL_COURIER_KEY, "false");
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: false, commerce: true });

    await setSwitch(AUTO_PULL_COURIER_KEY, null);
    await setSwitch(AUTO_PULL_COMMERCE_KEY, "false");
    expect(await loadAutoPullSwitches(context)).toEqual({ courier: true, commerce: false });
  });

  it.each(["true", "", "0", "off", "no", "False", "FALSE", " false", "false ", "null", "undefined"])(
    "keeps the pull ON for the stored value %j (only the exact text 'false' turns it off)",
    async (value) => {
      await setSwitch(AUTO_PULL_COURIER_KEY, value);
      await setSwitch(AUTO_PULL_COMMERCE_KEY, value);
      expect(await loadAutoPullSwitches(context)).toEqual({ courier: true, commerce: true });
    },
  );

  it("uses the two documented keys", () => {
    expect(AUTO_PULL_COURIER_KEY).toBe("auto_pull_courier");
    expect(AUTO_PULL_COMMERCE_KEY).toBe("auto_pull_commerce");
  });
});

describe("the scheduled cycle honours the switches", () => {
  it("pulls both with nothing stored", async () => {
    const order = await seedOpenDelivery();
    const { deps, courierCalls, commerceCalls } = recorder();

    await runScheduledReconcile(context, newReconcileState(), deps, { now: T0 });

    expect(courierCalls).toEqual([order.id]);
    expect(commerceCalls).toEqual(["shopify"]);
  });

  it("does not ask couriers when the courier switch is off, and still pulls shops", async () => {
    await seedOpenDelivery();
    await setSwitch(AUTO_PULL_COURIER_KEY, "false");
    const { deps, courierCalls, commerceCalls } = recorder();

    const report = await runScheduledReconcile(context, newReconcileState(), deps, { now: T0 });

    expect(courierCalls).toEqual([]);
    expect(report.courier).toMatchObject({ ran: false, attempted: 0, synced: 0, failed: 0 });
    expect(commerceCalls).toEqual(["shopify"]);
    expect(report.commerce.queued).toEqual(["shopify"]);
  });

  it("does not queue shops when the shop switch is off, and still asks couriers", async () => {
    const order = await seedOpenDelivery();
    await setSwitch(AUTO_PULL_COMMERCE_KEY, "false");
    const { deps, courierCalls, commerceCalls } = recorder();

    const report = await runScheduledReconcile(context, newReconcileState(), deps, { now: T0 });

    expect(commerceCalls).toEqual([]);
    expect(report.commerce).toMatchObject({ queued: [], failed: 0 });
    expect(courierCalls).toEqual([order.id]);
  });

  it("does nothing at all when both are off", async () => {
    await seedOpenDelivery();
    await setSwitch(AUTO_PULL_COURIER_KEY, "false");
    await setSwitch(AUTO_PULL_COMMERCE_KEY, "false");
    const { deps, courierCalls, commerceCalls } = recorder();

    const report = await runScheduledReconcile(context, newReconcileState(), deps, { now: T0 });

    expect(courierCalls).toEqual([]);
    expect(commerceCalls).toEqual([]);
    expect(report.courier.ran).toBe(false);
    expect(report.commerce.queued).toEqual([]);
  });

  it("reads the switches again on every cycle, so a change takes effect at the next one", async () => {
    await seedOpenDelivery();
    const state = newReconcileState();
    const { deps, courierCalls, commerceCalls } = recorder();

    await runScheduledReconcile(context, state, deps, { now: T0 });
    await setSwitch(AUTO_PULL_COURIER_KEY, "false");
    await setSwitch(AUTO_PULL_COMMERCE_KEY, "false");
    await runScheduledReconcile(context, state, deps, { now: T0 + RECONCILE_INTERVAL_MS });
    await setSwitch(AUTO_PULL_COURIER_KEY, null);
    await setSwitch(AUTO_PULL_COMMERCE_KEY, null);
    await runScheduledReconcile(context, state, deps, { now: T0 + 2 * RECONCILE_INTERVAL_MS });

    expect(courierCalls).toHaveLength(2);
    expect(commerceCalls).toHaveLength(2);
  });

  it("starts again at once when switched back on, instead of waiting out an interval that was spent switched off", async () => {
    await seedOpenDelivery();
    const state = newReconcileState();
    const { deps, courierCalls, commerceCalls } = recorder();
    await setSwitch(AUTO_PULL_COURIER_KEY, "false");
    await setSwitch(AUTO_PULL_COMMERCE_KEY, "false");

    await runScheduledReconcile(context, state, deps, { now: T0 });
    await setSwitch(AUTO_PULL_COURIER_KEY, "true");
    await setSwitch(AUTO_PULL_COMMERCE_KEY, "true");
    // one minute later: far inside the interval since the switched-off cycle
    await runScheduledReconcile(context, state, deps, { now: T0 + 60_000 });

    expect(courierCalls).toHaveLength(1);
    expect(commerceCalls).toEqual(["shopify"]);
    expect(state.lastCourierAt).toBe(T0 + 60_000);
  });

  it("leaves the sweep position where it was while the courier switch is off", async () => {
    for (let index = 0; index < 3; index += 1) await seedOpenDelivery();
    const state = newReconcileState();
    const { deps } = recorder();
    await runScheduledReconcile(context, state, deps, { now: T0, courierPerCycle: 2 });
    const cursorAfterFirst = state.courierCursor;
    expect(cursorAfterFirst).not.toBeNull();

    await setSwitch(AUTO_PULL_COURIER_KEY, "false");
    await runScheduledReconcile(context, state, deps, {
      now: T0 + RECONCILE_INTERVAL_MS,
      courierPerCycle: 2,
    });

    expect(state.courierCursor).toBe(cursorAfterFirst);
  });
});
