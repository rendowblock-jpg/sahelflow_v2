process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = vi.hoisted(() => { process.env.SF_ACTIVE_SHOP_ID = "testshop0001"; return { actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined)  }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));

import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { phoneOf } from "./roundtrip-phone";
import { actorFor, buildRig } from "./roundtrip-world";

const raw = db as unknown as PrismaClient;
const DEVICE = "phone_rt_0001";
const clock = { t: 0 };

async function pendingOrder() {
  const customer = await seedCustomer(raw); const product = await seedProduct(raw, { stock: 7, lowStockThreshold: 5 });
  const order = await seedOrder(raw, { status: "pending", customerId: customer.id, productId: product.id });
  await raw.order.update({ where: { id: order.id }, data: { sourceMetadata: trustedManualOrderSourceMetadata() } });
  return order;
}
async function start() {
  clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
  const rig = await buildRig(DEVICE); await rig.publish();
  const phone = await phoneOf(rig, clock);
  expect(phone.polled).toMatchObject({ kind: "updated" });
  return { rig, phone };
}
const status = async (id: string) => (await raw.order.findUnique({ where: { id } }))?.status;
beforeEach(async () => {
  await cleanDb(raw); vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
});

describe("phone -> real relay worker -> desktop executor on real SQLite -> result -> phone", () => {
  it("confirm: the PC really confirms, and the phone says so only after the PC answered", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    const put = await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    expect(put).toMatchObject({ ok: true });
    await phone.outbox.flush();
    expect(await phone.only()).toMatchObject({ state: "sent" }); expect(await status(order.id)).toBe("pending");
    expect(await rig.runDesktop()).toMatchObject({ completed: 1 });
    expect(await status(order.id)).toBe("confirmed");
    await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "committed", lastError: null });
  });

  it("reject: the order is cancelled on the PC and the phone ends committed", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    await phone.outbox.enqueue({ kind: "command.orders.reject", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "fakeOrder" });
    await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh();
    expect(await status(order.id)).toBe("cancelled"); expect(await phone.only()).toMatchObject({ state: "committed" });
  });

  it("the order changed on the PC meanwhile: the phone says so, the order is not touched", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await raw.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
    await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "failed", resultCode: "ORDER_CHANGED" });
    expect(await status(order.id)).toBe("pending"); expect(hoisted.dispatch).not.toHaveBeenCalled();
  });

  it("an expired command: the PC refuses it with the typed code, nothing changes, the phone never says done", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    clock.t = Date.now() + 20_000 - 12 * 3_600_000; // sealed so that it dies 20 s from now (confirm lives 12 h)
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush(); clock.t = Date.now();
    expect(await phone.only()).toMatchObject({ state: "sent" });
    expect(await rig.runDesktop(Date.now() + 21_000)).toMatchObject({ completed: 1 });
    expect(await status(order.id)).toBe("pending");
    clock.t = Date.now() + 21_000; await phone.outbox.refresh();
    const record = await phone.only();
    expect(record?.state).not.toBe("committed"); expect(record?.state).toBe("expired");
  });

  it("the late look: the PC confirmed in time, the phone looks after the deadline: committed, never expired", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    clock.t = Date.now() + 20_000 - 12 * 3_600_000; // dies 20 s from now
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush(); clock.t = Date.now();
    expect(await rig.runDesktop()).toMatchObject({ completed: 1 }); expect(await status(order.id)).toBe("confirmed");
    clock.t = Date.now() + 25_000; // the phone looks AFTER its own deadline
    await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "committed", lastError: null });
  });

  it("the late look with the relay down: unknown (never expired or failed), committed once the relay answers", async () => {
    let down = false; clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
    const rig = await buildRig(DEVICE); await rig.publish();
    const phone = await phoneOf(rig, clock, (async (input: RequestInfo | URL, init?: RequestInit) => { if (down) throw new TypeError("offline"); return rig.relayFetch(input, init); }) as typeof fetch);
    const order = await pendingOrder();
    clock.t = Date.now() + 20_000 - 12 * 3_600_000;
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush(); clock.t = Date.now();
    expect(await rig.runDesktop()).toMatchObject({ completed: 1 }); expect(await status(order.id)).toBe("confirmed");
    clock.t = Date.now() + 25_000; down = true; await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "unknown", lastError: "deadline_unsure" });
    down = false; await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "committed" });
  });

  it("a revoked device: the relay refuses its command, nothing reaches the PC, the poll says revoked", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    expect((await rig.revoke()).status).toBe(200);
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush();
    expect(await phone.only()).toMatchObject({ state: "queued", lastError: "http_401" });
    expect(await rig.runDesktop()).toMatchObject({ completed: 0 }); expect(await status(order.id)).toBe("pending");
    expect(await phone.relay.poll()).toEqual({ kind: "revoked" });
  });

  it("revoked while the command waits on the relay: the PC never runs it", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush(); expect(await phone.only()).toMatchObject({ state: "sent" });
    expect((await rig.revoke()).status).toBe(200);
    expect(await rig.runDesktop()).toMatchObject({ completed: 0 }); expect(await status(order.id)).toBe("pending");
    await phone.outbox.refresh(); expect((await phone.only())?.state).not.toBe("committed");
  });
});
