process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined)  }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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
afterAll(() => hoisted.rt.dispose());
beforeEach(async () => {
  await cleanDb(raw); vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
});

describe("DIAG: what the PC answered to the confirm (the real result code)", () => {
  it("prints the phone record after the desktop ran", async () => {
    const { rig, phone } = await start(); const order = await pendingOrder();
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush();
    const out = await rig.runDesktop();
    await phone.outbox.refresh();
    const r = await phone.only();
    console.log("DIAG out=" + JSON.stringify(out));
    console.log("DIAG record=" + JSON.stringify({ state: r?.state, lastError: r?.lastError, resultCode: r?.resultCode, guarded: (r as { guarded?: unknown } | undefined)?.guarded }));
    console.log("DIAG trusted calls=" + JSON.stringify(hoisted.trusted.mock.calls.length) + " status=" + (await status(order.id)));
    expect(true).toBe(true);
  });
});
