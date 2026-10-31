process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Same brand-check replacement as projection-readers.integration.test.ts: only the trusted-actor brand is faked.
// The database, the protected client, the field gates, the phone Today counter and the held rule all run for real.
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, seedCustomer, seedProduct } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { isHeldOutboxIntent } from "@/lib/whatsapp/held-send";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import { DEVICE_ID, NOW, actor, makeRig } from "./__tests__/projection-kit";
import { CONVERSATIONS_MAX, MESSAGES_PER_CONVERSATION, type ConversationsProjection } from "./contracts";
import { publishRemoteConversationsProjection } from "./conversations-projection";
import { HELD_MESSAGES_MAX, readHeldMessageIds, type HeldLookupClient } from "./held-messages";
import { HELD_SEND_EFFECT_TYPES, readPhoneTodayCounts } from "./phone-today-counts";

/**
 * W3-F7. A message the PC's send guard HELD must wear `held` on the phone, counted by the SAME rule as the
 * "WhatsApp held" number on Today. Held is an outbox intent (failed + outcome none + the hold code + a WhatsApp
 * send type), joined to its message through WhatsAppOutboundEffect.effectKey. Everything here runs on the real
 * SQLite file and the real protected client; no WhatsApp message is ever sent.
 */
const raw = db as unknown as PrismaClient;
const real = db as unknown as HeldLookupClient;

const TEXT = "whatsapp.text.send.v1";
const IMAGE = "whatsapp.image.send.v1";
const VOICE = "whatsapp.voice.send.v1";
const MSG_KEYS = ["at", "deliveryStatus", "direction", "held", "id", "text", "truncated", "type"];

let seq = 0;
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);

async function clean(): Promise<void> {
  await cleanDb(raw);
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await raw.whatsAppOutboundEffect.deleteMany();
  await raw.outboxIntent.deleteMany();
  await raw.businessCommand.deleteMany();
}

beforeEach(async () => {
  await clean();
  seq = 0;
  // One customer and one product per test, like the other real-database suites of this folder.
  await seedCustomer(raw, { name: "Karim Haddad", phone: "0661000111" });
  await seedProduct(raw);
});

async function chat(name: string, opts: { unread?: number; lastAgo?: number; archived?: boolean } = {}) {
  seq += 1;
  return db.conversation.create({
    data: {
      id: `conv-${seq}`,
      channel: "whatsapp",
      contactName: name,
      contactPhone: `066100${seq}`,
      sourceId: `src-${seq}@s.whatsapp.net`,
      unreadCount: opts.unread ?? 0,
      lastMessageAt: at(opts.lastAgo ?? 5),
      ...(opts.archived ? { archivedAt: at(1) } : {}),
    },
  });
}

async function say(
  conversationId: string,
  minutesAgo: number,
  extra: { body?: string; direction?: string; messageType?: string; deliveryStatus?: string } = {},
) {
  seq += 1;
  return db.message.create({
    data: {
      id: `msg-${seq}`,
      conversationId,
      body: extra.body ?? `text ${seq}`,
      direction: extra.direction ?? "outbound",
      timestamp: at(minutesAgo),
      messageType: extra.messageType ?? "text",
      deliveryStatus: extra.deliveryStatus ?? "sent",
    },
  });
}

type IntentShape = {
  effectType?: string;
  status?: string;
  outcomeState?: string;
  lastErrorCode?: string | null;
  createdAgo?: number;
  withEffect?: boolean;
};

/** Default shape = a held send. Returns the effect key (the id the join uses). */
async function intent(messageId: string, shape: IntentShape = {}): Promise<string> {
  seq += 1;
  const effectKey = `effect-${seq}`;
  const command = await raw.businessCommand.create({
    data: {
      id: `cmd-${seq}`,
      idempotencyKey: `key-${seq}`,
      commandType: "whatsapp_message.queue.v1",
      aggregateType: "whatsapp-message",
      aggregateId: messageId,
      requestHash: "0".repeat(64),
      actor: "test",
      correlationId: messageId,
      expectedVersion: 0,
      committedVersion: 1,
    },
  });
  const status = shape.status ?? "failed";
  await raw.outboxIntent.create({
    data: {
      id: `intent-${seq}`,
      effectKey,
      commandId: command.id,
      effectType: shape.effectType ?? TEXT,
      payloadJson: "{}",
      status,
      outcomeState: shape.outcomeState ?? "none",
      lastErrorCode: shape.lastErrorCode === undefined ? SEND_GUARD_HOLD_ERROR_CODE : shape.lastErrorCode,
      createdAt: at(shape.createdAgo ?? 1),
      ...(status === "dead_letter" ? { deadLetteredAt: at(0) } : {}),
    },
  });
  if (shape.withEffect !== false) await raw.whatsAppOutboundEffect.create({ data: { effectKey, messageId } });
  return effectKey;
}

/** A held message in a chat (text by default). */
async function heldIn(conversationId: string, minutesAgo: number, shape: IntentShape = {}, extra: { body?: string; messageType?: string } = {}) {
  const message = await say(conversationId, minutesAgo, extra);
  const effectKey = await intent(message.id, shape);
  return { message, effectKey };
}

function counting() {
  const calls = { outboxIntent: [] as unknown[], whatsAppOutboundEffect: [] as unknown[], message: [] as unknown[] };
  const client: HeldLookupClient = {
    outboxIntent: { findMany: (args) => { calls.outboxIntent.push(args); return real.outboxIntent.findMany(args); } },
    whatsAppOutboundEffect: { findMany: (args) => { calls.whatsAppOutboundEffect.push(args); return real.whatsAppOutboundEffect.findMany(args); } },
    message: { findMany: (args) => { calls.message.push(args); return real.message.findMany(args); } },
  };
  const total = () => calls.outboxIntent.length + calls.whatsAppOutboundEffect.length + calls.message.length;
  return { calls, client, total };
}

async function publish(context = actor("owner")) {
  const rig = makeRig();
  await publishRemoteConversationsProjection({
    client: rig.client as never, desktopKeys: rig.desktop, actorContext: context, deviceId: DEVICE_ID, now: NOW,
  });
  const envelope = rig.sent[rig.sent.length - 1];
  if (!envelope) throw new Error("the publisher sent nothing");
  return rig.open<ConversationsProjection>(envelope);
}
const allMessages = (p: ConversationsProjection) => p.conversations.flatMap((c) => c.messages);
const heldOf = (p: ConversationsProjection) => allMessages(p).filter((m) => m.held);

describe("readHeldMessageIds: real database", () => {
  it("says nothing held on an empty database, with ONE query", async () => {
    const { client, total } = counting();
    const found = await readHeldMessageIds(client);
    expect(found.byMessageId.size).toBe(0);
    expect(found.truncated).toBe(false);
    expect(total()).toBe(1);
  });

  it("maps a held text to its message and conversation through the effect key", async () => {
    const one = await chat("A");
    const { message } = await heldIn(one.id, 3);
    await say(one.id, 2); // a plain message of the same chat
    const found = await readHeldMessageIds();
    expect(Object.fromEntries(found.byMessageId)).toEqual({ [message.id]: one.id });
  });

  it("is decided by the same rule as isHeldOutboxIntent and the Today count, on every shape", async () => {
    const room = await chat("Shapes");
    const shapes: Array<[string, IntentShape]> = [
      ["held text", {}],
      ["held image", { effectType: IMAGE }],
      ["held voice", { effectType: VOICE }],
      ["ambiguous outcome", { outcomeState: "ambiguous" }],
      ["another error code", { lastErrorCode: "SEND_FAILED" }],
      ["no error code", { lastErrorCode: null }],
      ["approved, queued again", { status: "queued" }],
      ["sent", { status: "succeeded", lastErrorCode: null }],
      ["discarded (W3-E shape: dead_letter, hold code kept)", { status: "dead_letter" }],
      ["not a send (media fetch)", { effectType: "whatsapp.media.fetch.v1" }],
      ["held shape but no effect row", { withEffect: false }],
    ];
    const expectHeld: string[] = [];
    let heldShapes = 0;
    for (const [label, shape] of shapes) {
      const { message } = await heldIn(room.id, 1, shape, { body: label });
      const facts = {
        status: shape.status ?? "failed",
        outcomeState: shape.outcomeState ?? "none",
        lastErrorCode: shape.lastErrorCode === undefined ? SEND_GUARD_HOLD_ERROR_CODE : shape.lastErrorCode,
      };
      const isSend = (HELD_SEND_EFFECT_TYPES as readonly string[]).includes(shape.effectType ?? TEXT);
      const rule = isHeldOutboxIntent(facts) && isSend && shape.withEffect !== false;
      if (rule) { expectHeld.push(message.id); heldShapes += 1; }
    }
    const found = await readHeldMessageIds();
    expect(Array.from(found.byMessageId.keys()).sort()).toEqual(expectHeld.sort());
    expect(heldShapes).toBe(3);
    // The Today counter reads the intents themselves: it must give the same number for the rows that have a message.
    expect((await readPhoneTodayCounts()).whatsappHeld).toBe(4); // + the held shape whose effect row is missing
  });

  it("uses at most 3 queries however many chats hold something", async () => {
    for (let i = 0; i < 6; i += 1) {
      const c = await chat(`Chat ${i}`);
      await heldIn(c.id, 2 + i);
    }
    const { client, calls, total } = counting();
    const found = await readHeldMessageIds(client);
    expect(found.byMessageId.size).toBe(6);
    expect(new Set(found.byMessageId.values()).size).toBe(6);
    expect(total()).toBeLessThanOrEqual(3);
    expect([calls.outboxIntent.length, calls.whatsAppOutboundEffect.length, calls.message.length]).toEqual([1, 1, 1]);
  });

  it("attaches each held id to its OWN chat even when two chats got the same text", async () => {
    const a = await chat("A");
    const b = await chat("B");
    const first = await heldIn(a.id, 4, {}, { body: "Promo -30% today" });
    const second = await heldIn(b.id, 3, {}, { body: "Promo -30% today" });
    const found = await readHeldMessageIds();
    expect(found.byMessageId.get(first.message.id)).toBe(a.id);
    expect(found.byMessageId.get(second.message.id)).toBe(b.id);
  });

  it("limits the lookup to the asked chats, and asks nothing for an empty list", async () => {
    const a = await chat("A");
    const b = await chat("B");
    const first = await heldIn(a.id, 4);
    await heldIn(b.id, 3);
    const only = await readHeldMessageIds(undefined, [a.id]);
    expect(Array.from(only.byMessageId.keys())).toEqual([first.message.id]);
    const { client, total } = counting();
    expect((await readHeldMessageIds(client, [])).byMessageId.size).toBe(0);
    expect(total()).toBe(0);
  });

  it("leaves out a held message of an archived chat", async () => {
    const live = await chat("Live");
    const old = await chat("Archived", { archived: true });
    const kept = await heldIn(live.id, 3);
    await heldIn(old.id, 2);
    const found = await readHeldMessageIds();
    expect(Array.from(found.byMessageId.keys())).toEqual([kept.message.id]);
  });

  it("keeps only the newest 200 held sends and says it was cut", async () => {
    expect(HELD_MESSAGES_MAX).toBe(200);
    const room = await chat("Many");
    const messages = await Promise.all([say(room.id, 1)]);
    const first = messages[0];
    if (!first) throw new Error("no message");
    const commandBase = { commandType: "whatsapp_message.queue.v1", aggregateType: "whatsapp-message", aggregateId: first.id, requestHash: "0".repeat(64), actor: "test", correlationId: first.id, expectedVersion: 0, committedVersion: 1 };
    const total = HELD_MESSAGES_MAX + 5;
    await raw.businessCommand.createMany({ data: Array.from({ length: total }, (_, i) => ({ ...commandBase, id: `bulk-cmd-${i}`, idempotencyKey: `bulk-key-${i}` })) });
    await raw.outboxIntent.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        id: `bulk-intent-${i}`, effectKey: `bulk-effect-${i}`, commandId: `bulk-cmd-${i}`, effectType: TEXT, payloadJson: "{}",
        status: "failed", outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE, createdAt: at(1000 - i),
      })),
    });
    const { client, calls } = counting();
    const found = await readHeldMessageIds(client);
    expect(found.truncated).toBe(true);
    const asked = calls.whatsAppOutboundEffect[0] as { where: { effectKey: { in: string[] } } };
    expect(asked.where.effectKey.in).toHaveLength(HELD_MESSAGES_MAX);
    // newest first: the five OLDEST intents (bulk-effect-0..4) are the ones left out
    expect(asked.where.effectKey.in).not.toContain("bulk-effect-0");
    expect(asked.where.effectKey.in).toContain(`bulk-effect-${total - 1}`);
  });

  it("does not swallow a failing query: the caller must see it", async () => {
    const broken: HeldLookupClient = {
      ...real,
      outboxIntent: { findMany: () => Promise.reject(new Error("db is locked")) },
    };
    await expect(readHeldMessageIds(broken)).rejects.toThrow("db is locked");
  });
});

describe("the held badge in the conversations projection: real database", () => {
  it("says nothing held on an empty database", async () => {
    const payload = await publish();
    expect(payload).toEqual({ conversations: [], window: { conversations: 0, perConversationMessages: 0 } });
  });

  it("marks only the held text: held true and deliveryStatus held, same message key set", async () => {
    const room = await chat("A", { unread: 1 });
    const plain = await say(room.id, 5, { direction: "inbound" });
    const { message } = await heldIn(room.id, 3, {}, { body: "Hello from the PC" });
    const payload = await publish();
    const messages = payload.conversations[0]?.messages ?? [];
    expect(messages.map((m) => m.id)).toEqual([plain.id, message.id]);
    expect(messages[0]).toMatchObject({ held: false, deliveryStatus: "sent" });
    expect(messages[1]).toMatchObject({ held: true, deliveryStatus: "held", text: "Hello from the PC", direction: "out" });
    for (const m of messages) expect(Object.keys(m).sort()).toEqual(MSG_KEYS);
  });

  it("marks a held image and a held voice note too, without any url or text", async () => {
    const room = await chat("A");
    const image = await heldIn(room.id, 4, { effectType: IMAGE }, { body: "https://mmg.whatsapp.net/secret.jpg", messageType: "image" });
    const voice = await heldIn(room.id, 3, { effectType: VOICE }, { body: "/tmp/voice.ogg", messageType: "voice" });
    const payload = await publish();
    const byId = Object.fromEntries(allMessages(payload).map((m) => [m.id, m]));
    expect(byId[image.message.id]).toMatchObject({ held: true, deliveryStatus: "held", type: "image", text: "" });
    expect(byId[voice.message.id]).toMatchObject({ held: true, deliveryStatus: "held", text: "" });
    expect(JSON.stringify(payload)).not.toMatch(/whatsapp\.net|secret|voice\.ogg/);
  });

  it("shows a held message older than the last 10, oldest first, once", async () => {
    const room = await chat("A");
    const old = await heldIn(room.id, 500);
    for (let i = 0; i < MESSAGES_PER_CONVERSATION + 2; i += 1) await say(room.id, 20 - i);
    const messages = (await publish()).conversations[0]?.messages ?? [];
    expect(messages).toHaveLength(MESSAGES_PER_CONVERSATION + 1);
    expect(messages[0]).toMatchObject({ id: old.message.id, held: true });
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);
    expect(messages.slice(1).every((m) => !m.held)).toBe(true);
  });

  it("never grows past the window plus 3: all 5 old held messages stay, the oldest plain ones go", async () => {
    const room = await chat("A");
    for (let i = 0; i < 5; i += 1) await heldIn(room.id, 600 - i);
    for (let i = 0; i < MESSAGES_PER_CONVERSATION; i += 1) await say(room.id, 20 - i);
    const messages = (await publish()).conversations[0]?.messages ?? [];
    expect(messages).toHaveLength(MESSAGES_PER_CONVERSATION + 3);
    expect(messages.filter((m) => m.held)).toHaveLength(5);
    expect(messages.slice(0, 5).every((m) => m.held)).toBe(true);
  });

  it("puts a held chat FIRST and keeps it inside the 20, even when it is the oldest and has nothing unread", async () => {
    for (let i = 0; i < CONVERSATIONS_MAX + 2; i += 1) {
      const busy = await chat(`Busy ${i}`, { unread: 1, lastAgo: 10 + i });
      await say(busy.id, 10 + i, { direction: "inbound" });
    }
    const stale = await chat("Stale", { unread: 0, lastAgo: 9000 });
    const { message } = await heldIn(stale.id, 9000);
    const payload = await publish();
    expect(payload.conversations).toHaveLength(CONVERSATIONS_MAX);
    expect(payload.conversations[0]?.id).toBe(stale.id);
    expect(payload.conversations[0]?.messages.map((m) => m.id)).toEqual([message.id]);
    expect(new Set(payload.conversations.map((c) => c.id)).size).toBe(CONVERSATIONS_MAX);
    expect(heldOf(payload)).toHaveLength(1);
    expect(payload.window.conversations).toBe(CONVERSATIONS_MAX);
  });

  it("lists a held AND unread chat once, held chats before unread ones, newest first inside each group", async () => {
    const unreadNewest = await chat("Unread", { unread: 3, lastAgo: 1 });
    await say(unreadNewest.id, 1, { direction: "inbound" });
    const heldOlder = await chat("Held older", { unread: 1, lastAgo: 50 });
    await heldIn(heldOlder.id, 50);
    const heldNewer = await chat("Held newer", { unread: 0, lastAgo: 20 });
    await heldIn(heldNewer.id, 20);
    const ids = (await publish()).conversations.map((c) => c.id);
    expect(ids).toEqual([heldNewer.id, heldOlder.id, unreadNewest.id]);
  });

  it("does not call an ambiguous send held, even in the same chat as a held one", async () => {
    const room = await chat("A");
    const ambiguous = await heldIn(room.id, 5, { outcomeState: "ambiguous" });
    const held = await heldIn(room.id, 4);
    const byId = Object.fromEntries(allMessages(await publish()).map((m) => [m.id, m]));
    expect(byId[ambiguous.message.id]).toMatchObject({ held: false, deliveryStatus: "sent" });
    expect(byId[held.message.id]).toMatchObject({ held: true });
  });

  it("an approved (queued), a sent and a discarded send are not held; discarding drops the badge", async () => {
    const room = await chat("A");
    const approved = await heldIn(room.id, 6, { status: "queued" });
    const sent = await heldIn(room.id, 5, { status: "succeeded", lastErrorCode: null });
    // W3-E (wave3/e-held-discard adf7aa71) discards by moving the intent to dead_letter and KEEPING the hold code.
    const discarded = await heldIn(room.id, 4, { status: "dead_letter" });
    const live = await heldIn(room.id, 3);
    expect(heldOf(await publish()).map((m) => m.id)).toEqual([live.message.id]);
    await raw.outboxIntent.update({ where: { effectKey: live.effectKey }, data: { status: "dead_letter", deadLetteredAt: NOW } });
    const after = await publish();
    expect(heldOf(after)).toEqual([]);
    const byId = Object.fromEntries(allMessages(after).map((m) => [m.id, m]));
    for (const row of [approved, sent, discarded, live]) expect(byId[row.message.id]).toMatchObject({ held: false, deliveryStatus: "sent" });
  });

  it("cuts a held text at 1,000 characters and flags it like any other", async () => {
    const room = await chat("A");
    const { message } = await heldIn(room.id, 3, {}, { body: "é".repeat(1500) });
    const row = allMessages(await publish()).find((m) => m.id === message.id);
    expect(row).toMatchObject({ held: true, truncated: true });
    expect(row?.text).toHaveLength(1000);
  });

  it("leaves out an archived chat, held or not", async () => {
    const old = await chat("Archived", { archived: true });
    await heldIn(old.id, 2);
    expect(await publish()).toEqual({ conversations: [], window: { conversations: 0, perConversationMessages: 0 } });
  });

  it("without customers.contact.read still shows held, but no name and no phone", async () => {
    const room = await chat("Karim", { unread: 1 });
    await heldIn(room.id, 2);
    const payload = await publish(actor("operator", ["shops.read", "conversations.read"]));
    const row = payload.conversations[0];
    expect(row && "contactName" in row).toBe(false);
    expect(row && "phone" in row).toBe(false);
    expect(heldOf(payload)).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toMatch(/Karim|066100/);
  });

  it("without conversations.read the held message does not leak around the gate", async () => {
    const room = await chat("A");
    await heldIn(room.id, 2, {}, { body: "private held text" });
    const payload = await publish(actor("operator", ["shops.read", "orders.read"]));
    expect(payload).toEqual({ conversations: [], window: { conversations: 0, perConversationMessages: 0 } });
    expect(JSON.stringify(payload)).not.toMatch(/held|private/);
  });

  it("AGREEMENT: the held badges equal the Today number, and both drop together when an intent leaves the hold", async () => {
    const a = await chat("A", { unread: 1 });
    const b = await chat("B");
    const c = await chat("C", { lastAgo: 900 });
    await heldIn(a.id, 5);                                      // held text
    await heldIn(b.id, 4);                                      // held text (same chat holds more than one send)
    const image = await heldIn(c.id, 900, { effectType: IMAGE }, { messageType: "image" }); // held image
    await heldIn(a.id, 3, { outcomeState: "ambiguous" });      // ambiguous: wins over held
    await heldIn(b.id, 2, { status: "queued" });                // approved
    await heldIn(b.id, 1, { status: "succeeded", lastErrorCode: null }); // sent
    await heldIn(c.id, 800, { status: "dead_letter" });         // discarded
    const before = await publish();
    expect(heldOf(before)).toHaveLength(3);
    expect((await readPhoneTodayCounts()).whatsappHeld).toBe(3);
    await raw.outboxIntent.update({ where: { effectKey: image.effectKey }, data: { status: "queued" } });
    const after = await publish();
    expect(heldOf(after)).toHaveLength(2);
    expect((await readPhoneTodayCounts()).whatsappHeld).toBe(2);
  });

  it("FAILS the build when the held lookup fails: a snapshot that says nothing held would be a lie", async () => {
    const room = await chat("A");
    await heldIn(room.id, 2);
    const spy = vi.spyOn(raw.outboxIntent, "findMany").mockRejectedValueOnce(new Error("db is locked"));
    const rig = makeRig();
    await expect(
      publishRemoteConversationsProjection({ client: rig.client as never, desktopKeys: rig.desktop, actorContext: actor("owner"), deviceId: DEVICE_ID, now: NOW }),
    ).rejects.toThrow("db is locked");
    expect(rig.sent).toEqual([]);
    spy.mockRestore();
  });
});
