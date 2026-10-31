// W200b: the relay hands the SAME command to the PC twice (the PC ran it, but the answer to the relay was lost, so the cursor did not move).
// The REAL WhatsApp queue runs here (message row + outbox intent on a test-owned SQLite); only the sidecar's send is a counting fake.
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined), send: vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "wamid-replay-1", status: "sent" })) }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));
vi.mock("@/lib/whatsapp/sidecar-client", async (o) => { const real = await o<typeof import("@/lib/whatsapp/sidecar-client")>(); return { ...real, sidecar: { ...real.sidecar, status: (async () => ({ status: "connected", user: { id: "213555999000:12@s.whatsapp.net" } })) as never, send: ((...a: unknown[]) => hoisted.send(...a)) as never, receipt: (async () => null) as never } }; });
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { phoneOf, type Rig } from "./roundtrip-phone";
import { actorFor, buildRig } from "./roundtrip-world";

const raw = db as unknown as PrismaClient;
const DEVICE = "phone_rt_0003";
const clock = { t: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function start() {
  clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
  const rig = await buildRig(DEVICE); await rig.publish();
  return { rig, phone: await phoneOf(rig, clock) };
}
/** The PC runs the command, but its answer never reaches the relay: the poll throws, the cursor stays, the next poll offers it again. */
async function lostAnswerThenReplay(rig: Rig) {
  let down = true;
  vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (down && (init?.method ?? "GET") === "POST" && url.endsWith("/result")) return Promise.reject(new TypeError("network lost"));
    return rig.relayFetch(input, init);
  }) as typeof fetch);
  await expect(rig.runDesktop()).rejects.toThrow();
  down = false; vi.stubGlobal("fetch", rig.relayFetch);
  return { replay: () => rig.runDesktop() };
}
async function chat() {
  const c = await db.conversation.create({ data: { channel: "whatsapp", contactName: "Samira", contactPhone: "213661234567", sourceId: "213661234567@s.whatsapp.net" } });
  const inbound = await db.message.create({ data: { conversationId: c.id, body: "hello", direction: "inbound", timestamp: new Date(Date.now() - 60_000) } });
  return { c, inbound, outbound: () => db.message.count({ where: { conversationId: c.id, direction: "outbound" } }) };
}
afterAll(() => hoisted.rt.dispose());
beforeEach(async () => {
  await cleanDb(raw);
  for (const m of ["whatsAppOutboundEffect", "message", "conversation", "projectionInvalidation", "outboxIntent", "domainEvent", "businessCommand", "businessAggregateVersion"] as const) await (db[m] as unknown as { deleteMany(): Promise<unknown> }).deleteMany();
  vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
});

describe("a command the relay offers twice is run once", () => {
  it("reply: the PC answered, the answer was lost, the replay is committed (not ALREADY_ANSWERED) and nothing is sent twice", async () => {
    const { rig, phone } = await start(); const { c, inbound, outbound } = await chat();
    await phone.outbox.enqueue({ kind: "command.messages.reply", target: { type: "conversation", id: c.id, lastSeenMessageId: inbound.id }, labelForUi: "Samira", draftText: "On the way" });
    await phone.outbox.flush();
    const lost = await lostAnswerThenReplay(rig);
    await vi.waitFor(() => expect(hoisted.send).toHaveBeenCalledTimes(1));
    expect(await outbound()).toBe(1);
    expect(await lost.replay()).toMatchObject({ completed: 1 });
    await phone.outbox.refresh(); await sleep(250);
    const rec = await phone.only();
    expect(rec).toMatchObject({ state: "committed" });
    expect((rec as { resultCode?: string } | undefined)?.resultCode).not.toBe("ALREADY_ANSWERED");
    expect(hoisted.send).toHaveBeenCalledTimes(1);
    expect(await outbound()).toBe(1);
    expect(await db.whatsAppOutboundEffect.count()).toBe(1);
  });

  it("reply: a NEW reply to the same chat is still ALREADY_ANSWERED (the guard is not weakened) and sends nothing", async () => {
    const { rig, phone } = await start(); const { c, inbound, outbound } = await chat();
    const send = { kind: "command.messages.reply" as const, target: { type: "conversation" as const, id: c.id, lastSeenMessageId: inbound.id }, labelForUi: "Samira", draftText: "On the way" };
    await phone.outbox.enqueue(send); await phone.outbox.flush(); await rig.runDesktop();
    await vi.waitFor(() => expect(hoisted.send).toHaveBeenCalledTimes(1));
    // The first command must be CLOSED on the phone before a second reply to the same chat is accepted (one open command per target and group).
    await phone.outbox.refresh(); await sleep(250); clock.t += 1000;
    expect(await phone.only()).toMatchObject({ state: "committed" });
    // A second, DIFFERENT reply carrying the same "last seen" message: the first reply is newer than it, so the guard must still refuse it.
    const second = await phone.outbox.enqueue({ ...send, draftText: "Another one" });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh(); await sleep(250);
    const records = await phone.outbox.list();
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.state === "failed")).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.send).toHaveBeenCalledTimes(1); expect(await outbound()).toBe(1);
  });

  it("confirm: the replay is committed, the order is confirmed once and its version moves once", async () => {
    const { rig, phone } = await start();
    const customer = await seedCustomer(raw); const product = await seedProduct(raw, { stock: 7, lowStockThreshold: 5 });
    const order = await seedOrder(raw, { status: "pending", customerId: customer.id, productId: product.id });
    await raw.order.update({ where: { id: order.id }, data: { sourceMetadata: trustedManualOrderSourceMetadata() } });
    const before = (await raw.order.findUniqueOrThrow({ where: { id: order.id } })).version;
    await phone.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: order.id, expectedVersion: order.version }, labelForUi: "Order", draftText: "" });
    await phone.outbox.flush();
    const lost = await lostAnswerThenReplay(rig);
    expect((await raw.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("confirmed");
    expect(await lost.replay()).toMatchObject({ completed: 1 });
    await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "committed" });
    const after = await raw.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("confirmed"); expect(after.version).toBe(before + 1);
  });
});
