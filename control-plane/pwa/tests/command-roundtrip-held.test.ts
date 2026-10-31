// W3b F6a-2: a phone reply to a chat whose newest message is HELD by the PC's send guard. Real relay, real executor, real SQLite.
// Only the WhatsApp queue is a fake (as in command-roundtrip-chat.test.ts); the held state is real OutboxIntent + WhatsAppOutboundEffect rows.
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined), queue: vi.fn(), process: vi.fn(async () => undefined) }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));
vi.mock("@/lib/whatsapp/durable-send", async (o) => ({ ...(await o<typeof import("@/lib/whatsapp/durable-send")>()), queueWhatsAppText: hoisted.queue, processWhatsAppEffect: hoisted.process }));
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import { phoneOf } from "./roundtrip-phone";
import { actorFor, buildRig } from "./roundtrip-world";

const raw = db as unknown as PrismaClient;
const DEVICE = "phone_rt_0002";
const clock = { t: 0 };
let seq = 0;
const ago = (s: number): Date => new Date(Date.now() - s * 1000);
async function start() { clock.t = Date.now(); hoisted.actor = actorFor(DEVICE); const rig = await buildRig(DEVICE); await rig.publish(); return { rig, phone: await phoneOf(rig, clock) }; }
async function chat() {
  const conversation = await db.conversation.create({ data: { channel: "whatsapp", contactName: "Samira", contactPhone: "213661234567", sourceId: "98765432101@lid" } });
  const inbound = await db.message.create({ data: { conversationId: conversation.id, body: "hello", direction: "inbound", timestamp: ago(120) } });
  return { conversation, inbound };
}
const out = (conversationId: string, secondsAgo: number) => db.message.create({ data: { conversationId, body: "out", direction: "outbound", timestamp: ago(secondsAgo) } });
/** The PC's own shape of a send-guard hold (held-messages.ts): intent failed + outcome none + hold code, joined by effectKey. */
async function intentFor(messageId: string, status = "failed", lastErrorCode: string | null = SEND_GUARD_HOLD_ERROR_CODE) {
  seq += 1; const effectKey = `eff-${seq}`;
  await raw.businessCommand.create({ data: { id: `cmd-${seq}`, idempotencyKey: `key-${seq}`, commandType: "whatsapp_message.queue.v1", aggregateType: "whatsapp-message", aggregateId: messageId, requestHash: "0".repeat(64), actor: "test", correlationId: messageId, expectedVersion: 0, committedVersion: 1 } });
  await raw.outboxIntent.create({ data: { id: `intent-${seq}`, effectKey, commandId: `cmd-${seq}`, effectType: "whatsapp.text.send.v1", payloadJson: "{}", status, outcomeState: "none", lastErrorCode, createdAt: new Date(), ...(status === "dead_letter" ? { deadLetteredAt: new Date() } : {}) } });
  await raw.whatsAppOutboundEffect.create({ data: { effectKey, messageId } });
}
const held = async (conversationId: string, secondsAgo: number) => { const m = await out(conversationId, secondsAgo); await intentFor(m.id); return m; };
async function replyAfter(lastSeenMessageId: string, conversationId: string) {
  const { rig, phone } = await start();
  await phone.outbox.enqueue({ kind: "command.messages.reply", target: { type: "conversation", id: conversationId, lastSeenMessageId }, labelForUi: "Samira", draftText: "On the way" });
  await phone.outbox.flush(); await rig.runDesktop(); await phone.outbox.refresh();
  return phone.only();
}
afterAll(() => hoisted.rt.dispose());
beforeEach(async () => {
  await cleanDb(raw); await db.collaborationComment.deleteMany(); await db.businessAggregateVersion.deleteMany();
  await raw.whatsAppOutboundEffect.deleteMany(); await raw.outboxIntent.deleteMany(); await raw.businessCommand.deleteMany();
  await db.message.deleteMany(); await db.conversation.deleteMany();
  vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
  hoisted.queue.mockImplementation(async (_c: unknown, input: { text: string; conversationId: string }) => {
    await db.message.create({ data: { conversationId: input.conversationId, body: input.text, direction: "outbound", timestamp: new Date() } });
    return { messageId: "msg-queued-1", effectKey: "effect-1", replayed: false };
  });
});

describe("reply behind a HELD message: what the PC answers (phone -> relay -> executor -> SQLite -> phone)", () => {
  it("(a) newest message is HELD, the phone shows the older inbound id: accepted and queued, NOT 'already answered'", async () => {
    const { conversation, inbound } = await chat(); await held(conversation.id, 60);
    const rec = await replyAfter(inbound.id, conversation.id);
    expect(rec?.resultCode).toBeUndefined(); // RED today: "ALREADY_ANSWERED"
    expect(rec).toMatchObject({ state: "committed" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
    expect(hoisted.queue.mock.calls[0]?.[1]).toMatchObject({ text: "On the way", conversationId: conversation.id });
  });
  it("(b) the phone shows the held message itself (its own id): queued", async () => {
    const { conversation } = await chat(); const h = await held(conversation.id, 60);
    expect(await replyAfter(h.id, conversation.id)).toMatchObject({ state: "committed" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
  });
  it("(c) a plain SENT outbound message newer than the id: ALREADY_ANSWERED, nothing queued", async () => {
    const { conversation, inbound } = await chat(); await out(conversation.id, 60);
    expect(await replyAfter(inbound.id, conversation.id)).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.queue).not.toHaveBeenCalled();
  });
  it.each([["succeeded", null], ["queued", SEND_GUARD_HOLD_ERROR_CODE]] as const)("(d) an APPROVED held message (%s) is an answer: ALREADY_ANSWERED", async (status, code) => {
    const { conversation, inbound } = await chat(); const m = await out(conversation.id, 60); await intentFor(m.id, status, code);
    expect(await replyAfter(inbound.id, conversation.id)).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.queue).not.toHaveBeenCalled();
  });
  it("(e) a held message AND a plain sent one after the id: the sent one answered it, ALREADY_ANSWERED", async () => {
    const { conversation, inbound } = await chat(); await held(conversation.id, 90); await out(conversation.id, 30);
    expect(await replyAfter(inbound.id, conversation.id)).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.queue).not.toHaveBeenCalled();
  });
  it("(e2) a plain sent one FIRST and a held message after it (the other order of (e)): still ALREADY_ANSWERED, whatever order the rows are read in", async () => {
    // Pins the whole window of newer messages: a lookup that looked at one row only would be fooled by one of the two orders ((e) or this one).
    const { conversation, inbound } = await chat(); await out(conversation.id, 90); await held(conversation.id, 30);
    expect(await replyAfter(inbound.id, conversation.id)).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.queue).not.toHaveBeenCalled();
  });
  it("(f) two held messages after the id: queued", async () => {
    const { conversation, inbound } = await chat(); await held(conversation.id, 90); await held(conversation.id, 30);
    const rec = await replyAfter(inbound.id, conversation.id);
    expect(rec?.resultCode).toBeUndefined(); // RED today: "ALREADY_ANSWERED"
    expect(rec).toMatchObject({ state: "committed" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
  });
  it("(g) a held message in ANOTHER chat does not hide a plain answer in this one", async () => {
    const { conversation, inbound } = await chat(); await out(conversation.id, 60);
    const other = await db.conversation.create({ data: { channel: "whatsapp", contactName: "Other", contactPhone: "213661234568", sourceId: "98765432102@lid" } }); await held(other.id, 30);
    expect(await replyAfter(inbound.id, conversation.id)).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
  });
});
