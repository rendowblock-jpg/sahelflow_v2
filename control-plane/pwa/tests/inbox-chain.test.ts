// W3-F174 step 3: the chain. Real SQLite -> the desktop conversations projection (F7 held rule) -> the real sealer -> the phone's real opener -> the REAL inbox renderers.
import { vi } from "vitest";

vi.hoisted(() => { process.env.SF_MASTER_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; });
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDb } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import type { PrismaClient } from "@prisma/client";
import { DEVICE_ID, NOW as DNOW, actor, makeRig } from "../../../src/lib/connected-platform/__tests__/projection-kit";
import type { ConnectedEnvelope } from "../../../src/lib/connected-platform/protocol";
import type { ConversationsProjection } from "../../../src/lib/connected-platform/contracts";
import { publishRemoteConversationsProjection } from "../../../src/lib/connected-platform/conversations-projection";
import { phoneReplyPayload } from "../../../src/lib/whatsapp/queue-phone-reply";
import { generateDeviceKeys, openEnvelopeWeb, type DeviceKeys } from "../../../src/lib/connected-platform/web";
import { createOutbox, type SealInput } from "../src/outbox/outbox";
import { createInboxController } from "../src/views/inbox/controller";
import { createInboxHost } from "../src/views/inbox/host";
import { createDraftStore } from "../src/views/notes";
import { bubble, bubbleIds, fakeHost, memDb, rowIds } from "./inbox-fixtures";

const raw = db as unknown as PrismaClient; const at = (m: number) => new Date(Date.UTC(2026, 9, 31, 0, m));
let phone: DeviceKeys; let phonePub = ""; let seq = 0;
beforeAll(async () => { const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys"); phone = made.keys; phonePub = made.publicKeys.encryptionPublicKey; }, 120_000);
// cleanDb empties WhatsAppOutboundEffect, OutboxIntent, BusinessCommand (raw SQL) and Message, Conversation.
beforeEach(async () => { await cleanDb(raw); });
// The rows this file seeds (conversations, messages, held intents, commands) must not outlive it: the API helpers' cleanDb in other files
// (src/app/api/__tests__/helpers.ts) does not clear WhatsAppOutboundEffect / OutboxIntent / BusinessCommand and fails on the left-over foreign keys.
afterAll(async () => { await cleanDb(raw); });

async function chat(id: string, name: string, o: { unread?: number; last: number; held?: string }) {
  await db.conversation.create({ data: { id, channel: "whatsapp", contactName: name, contactPhone: `0661${id.slice(-4)}`, sourceId: `${id}@s.whatsapp.net`, unreadCount: o.unread ?? 0, lastMessageAt: at(o.last) } });
  const messageId = `${id}-m1`; seq += 1;
  await db.message.create({ data: { id: messageId, conversationId: id, body: "Is this still available?", direction: o.held ? "outbound" : "inbound", timestamp: at(o.last), messageType: "text" } });
  if (!o.held) return;
  const effectKey = `effect-${seq}`;
  await raw.businessCommand.create({ data: { id: `cmd-${seq}`, idempotencyKey: `key-${seq}`, commandType: "whatsapp_message.queue.v1", aggregateType: "whatsapp-message", aggregateId: messageId, requestHash: "0".repeat(64), actor: "test", correlationId: messageId, expectedVersion: 0, committedVersion: 1 } });
  await raw.outboxIntent.create({ data: { id: `intent-${seq}`, effectKey, commandId: `cmd-${seq}`, effectType: "whatsapp.text.send.v1", payloadJson: "{}", status: o.held, outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE, createdAt: at(o.last), ...(o.held === "dead_letter" ? { deadLetteredAt: at(0) } : {}) } });
  await raw.whatsAppOutboundEffect.create({ data: { effectKey, messageId } });
}
// The desktop seals for THIS phone's real RSA key; the phone opens with openEnvelopeWeb, as the app does.
async function publishAndOpen(role: "owner" | "operator"): Promise<ConversationsProjection> {
  const rig = makeRig(); const sent: ConnectedEnvelope[] = [];
  const client = { ...rig.client, listDevices: async () => ({ devices: [{ device_id: DEVICE_ID, member_id: "6".repeat(32), encryption_public_key: phonePub, revocation_epoch: 0 }] }), putProjection: async (e: ConnectedEnvelope) => { sent.push(e); return { status: "stored", sequence: e.sequence }; } };
  const context = role === "owner" ? actor("owner") : actor("operator", ["shops.read", "conversations.read"]);
  await publishRemoteConversationsProjection({ client: client as never, desktopKeys: rig.desktop, actorContext: context, deviceId: DEVICE_ID, now: DNOW });
  const opened = await openEnvelopeWeb<ConversationsProjection>(sent[sent.length - 1], rig.desktop.signingPublicKey, phone.encryption.privateKey, { now: DNOW.getTime() + 60_000, expect: { recipientId: DEVICE_ID, deviceId: DEVICE_ID } });
  if (!opened.ok) throw new Error(`phone could not open: ${opened.reason}`);
  return opened.payload;
}
async function seed(): Promise<void> {
  await chat("conv-plain-0001", "Plain Pat", { last: 10 }); await chat("conv-unread-0002", "Unread Ulla", { last: 20, unread: 3 });
  await chat("conv-held-00003", "Held Hana", { last: 5, held: "failed" }); await chat("conv-disc-00004", "Discarded Dora", { last: 30, held: "dead_letter" }); await chat("conv-appr-00005", "Approved Abel", { last: 40, held: "queued" });
}

describe("the chain: PC database to the phone's screen", () => {
  it("the held chat is first, says Held on your PC with no button; discarded and approved are not held", async () => {
    await seed(); const data = await publishAndOpen("owner"); const f = fakeHost({ data }); const c = createInboxController(f.host); await c.refresh();
    const ids = rowIds(c.html()); expect(ids[0]).toBe("conv-held-00003"); expect(ids).toHaveLength(5);
    const byId = new Map(data.conversations.map((x) => [x.id, x.messages.some((m) => m.held)] as const));
    expect([...byId.entries()].filter(([, held]) => held).map(([id]) => id)).toEqual(["conv-held-00003"]);
    await c.act("open-chat", { id: "conv-held-00003" }); const html = c.html(); const b = bubble(html, bubbleIds(html)[0] ?? "");
    expect(b).toContain("Held on your PC"); expect(b).not.toMatch(/<button|data-act|<a |<form/i);
    await c.act("back", {}); await c.act("open-chat", { id: "conv-disc-00004" }); expect(c.html()).not.toContain("Held on your PC");
    await c.act("back", {}); await c.act("open-chat", { id: "conv-appr-00005" }); expect(c.html()).not.toContain("Held on your PC");
  });
  it("a role without contact: no name, no number anywhere; the screen says Customer", async () => {
    await seed(); const data = await publishAndOpen("operator"); expect(JSON.stringify(data)).not.toMatch(/Plain Pat|Held Hana|0661/);
    const f = fakeHost({ data }); const c = createInboxController(f.host); await c.refresh(); const list = c.html();
    expect(list).toContain("Customer"); expect(list).not.toMatch(/Plain Pat|Held Hana|0661/);
    await c.act("open-chat", { id: "conv-held-00003" }); expect(c.html()).toContain("Customer"); expect(c.html()).not.toMatch(/0661|Hana/);
  });
  it("the reply the host enqueues for the held chat parses with the desktop schema", async () => {
    await seed(); const data = await publishAndOpen("owner"); const sealed: SealInput[] = []; let n = 0;
    const outbox = createOutbox({ db: memDb(), now: () => DNOW.getTime(), deviceId: DEVICE_ID, newId: () => `id_${String(++n).padStart(8, "0")}`, policyVersion: () => 7, seal: async (i) => { sealed.push(i); return "{}"; }, post: async () => { throw new Error("network"); }, status: async () => ({ status: 200, body: { state: "queued", result: null } }), openResult: async () => ({ ok: false, reason: "malformed" }) });
    const host = createInboxHost({ outbox, readConversations: () => ({ status: "ready", data, asOf: DNOW.getTime() }), reload: async () => undefined, drafts: createDraftStore(memDb(), () => DNOW.getTime()), subscribeAll: () => () => undefined, go: () => undefined, now: () => DNOW.getTime(), locale: () => "en", online: () => true, pcOff: () => false, authorityExpiresAt: () => undefined });
    expect((await host.enqueueReply({ conversationId: "conv-held-00003", text: "On vous répond ce soir", lastSeenMessageId: "conv-held-00003-m1" })).ok).toBe(true);
    expect(phoneReplyPayload.parse(sealed[0]?.payload)).toEqual({ conversationId: "conv-held-00003", text: "On vous répond ce soir", lastSeenMessageId: "conv-held-00003-m1" });
  });
});
