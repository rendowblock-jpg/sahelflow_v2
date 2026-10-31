process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = vi.hoisted(() => ({ actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined), queue: vi.fn(), process: vi.fn(async () => undefined) }));
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));

vi.mock("@/lib/connected-platform/protocol", async (o) => { const a = await o<typeof import("@/lib/connected-platform/protocol")>(); return { ...a, isConnectedEnvelope: (v: unknown) => a.isConnectedEnvelope(v) || (typeof v === "object" && v !== null && (v as { shopId?: unknown }).shopId === "test" && a.isConnectedEnvelope({ ...(v as object), shopId: "testshop0001" })) }; });
vi.mock("@/lib/whatsapp/durable-send", async (o) => ({ ...(await o<typeof import("@/lib/whatsapp/durable-send")>()), queueWhatsAppText: hoisted.queue, processWhatsAppEffect: hoisted.process }));
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { phoneOf } from "./roundtrip-phone";
import { actorFor, buildRig } from "./roundtrip-world";

const raw = db as unknown as PrismaClient;
const DEVICE = "phone_rt_0002";
const clock = { t: 0 };
async function start() {
  clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
  const rig = await buildRig(DEVICE); await rig.publish();
  return { rig, phone: await phoneOf(rig, clock) };
}
beforeEach(async () => {
  await cleanDb(raw); await db.collaborationComment.deleteMany(); await db.businessAggregateVersion.deleteMany(); await db.message.deleteMany(); await db.conversation.deleteMany();
  vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
});

describe("reply and note: phone -> real relay -> desktop executor on real SQLite -> phone", () => {
  it("reply: the sender is called ONCE; the same reply again is ALREADY_ANSWERED and the sender is not called again", async () => {
    const { rig, phone } = await start();
    const conversation = await db.conversation.create({ data: { channel: "whatsapp", contactName: "Samira", contactPhone: "213661234567", sourceId: "98765432101@lid" } });
    const inbound = await db.message.create({ data: { conversationId: conversation.id, body: "hello", direction: "inbound", timestamp: new Date(Date.now() - 60_000) } });
    // The real queue writes the outbound row; this fake does the same, so "the PC answered" is true in the database.
    hoisted.queue.mockImplementation(async (_c: unknown, input: { text: string; conversationId: string }) => {
      await db.message.create({ data: { conversationId: input.conversationId, body: input.text, direction: "outbound", timestamp: new Date() } });
      return { messageId: "msg-queued-1", effectKey: "effect-1", replayed: false };
    });
    const send = { kind: "command.messages.reply" as const, target: { type: "conversation" as const, id: conversation.id, lastSeenMessageId: inbound.id }, labelForUi: "Samira", draftText: "On the way" };
    await phone.outbox.enqueue(send); await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh();
    const first = await phone.only();
    expect(first).toMatchObject({ state: "committed" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
    expect(hoisted.queue.mock.calls[0]?.[1]).toMatchObject({ text: "On the way", conversationId: conversation.id, clientMessageId: first?.commandId });
    clock.t += 1000;
    await phone.outbox.enqueue(send); await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh();
    const again = (await phone.outbox.list())[1];
    expect(again).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
  });

  it("note: one row lands in the PC's note table for the right order", async () => {
    const { rig, phone } = await start();
    const customer = await seedCustomer(raw); const product = await seedProduct(raw, { stock: 7, lowStockThreshold: 5 });
    const order = await seedOrder(raw, { status: "pending", customerId: customer.id, productId: product.id });
    await phone.outbox.enqueue({ kind: "command.comments.write", target: { type: "order", id: order.id }, labelForUi: "Order", draftText: "Call him after 6" });
    await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh();
    expect(await phone.only()).toMatchObject({ state: "committed" });
    const rows = await db.collaborationComment.findMany();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ entityType: "order", entityId: order.id, body: "Call him after 6" });
  });
});
