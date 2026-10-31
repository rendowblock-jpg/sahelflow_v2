process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined), queue: vi.fn(), process: vi.fn(async () => undefined)  }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));

vi.mock("@/lib/whatsapp/durable-send", async (o) => ({ ...(await o<typeof import("@/lib/whatsapp/durable-send")>()), queueWhatsAppText: hoisted.queue, processWhatsAppEffect: hoisted.process }));
import type { PrismaClient } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import { publishRemoteConversationsProjection } from "../../../src/lib/connected-platform/conversations-projection";
import { createCommandStack } from "../src/app/commands";
import { createInboxMount } from "../src/app/inbox-mount";
import { createVault } from "../src/storage/sealed";
import { createRelayClient } from "../src/today/relay-source";
import { createInboxController, type InboxHost } from "../src/views/inbox/controller";
import { createInboxHost } from "../src/views/inbox/host";
import { bubble, bubbleIds, rowIds } from "./inbox-fixtures";
import { RELAY, actorFor, buildRig } from "./roundtrip-world";

// W3-F wave 3 phase B, the whole phone chain: real SQLite (a chat, an unread chat, a chat with a HELD WhatsApp message) -> the PC's real
// conversations publisher -> the real relay worker -> the phone's real poll + opener (createCommandStack) -> the vault -> the inbox mount and
// host -> the REAL inbox renderers; then a reply through the real transport, relay and F2 executor to a fake WhatsApp sender.
const raw = db as unknown as PrismaClient; const DEVICE = "phone_rt_0003"; const clock = { t: 0 };
const PLAIN = "conv-plain-0001"; const UNREAD = "conv-unread-0002"; const HELD = "conv-held-00003";
let seq = 0; const at = (m: number) => new Date(clock.t - 3_600_000 + m * 60_000);
async function chat(id: string, name: string, o: { unread?: number; last: number; held?: string }) {
  await db.conversation.create({ data: { id, channel: "whatsapp", contactName: name, contactPhone: `0661${id.slice(-4)}`, sourceId: `${id}@s.whatsapp.net`, unreadCount: o.unread ?? 0, lastMessageAt: at(o.last) } });
  const messageId = `${id}-m1`; seq += 1;
  await db.message.create({ data: { id: messageId, conversationId: id, body: "Is this still available?", direction: o.held ? "outbound" : "inbound", timestamp: at(o.last), messageType: "text" } });
  if (!o.held) return;
  const effectKey = `effect-${seq}`;
  await raw.businessCommand.create({ data: { id: `cmd-${seq}`, idempotencyKey: `key-${seq}`, commandType: "whatsapp_message.queue.v1", aggregateType: "whatsapp-message", aggregateId: messageId, requestHash: "0".repeat(64), actor: "test", correlationId: messageId, expectedVersion: 0, committedVersion: 1 } });
  await raw.outboxIntent.create({ data: { id: `intent-${seq}`, effectKey, commandId: `cmd-${seq}`, effectType: "whatsapp.text.send.v1", payloadJson: "{}", status: o.held, outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE, createdAt: at(o.last) } });
  await raw.whatsAppOutboundEffect.create({ data: { effectKey, messageId } });
}
async function start() {
  clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
  const rig = await buildRig(DEVICE); await rig.publish();
  await chat(PLAIN, "Plain Pat", { last: 10 }); await chat(UNREAD, "Unread Ulla", { last: 20, unread: 3 }); await chat(HELD, "Held Hana", { last: 5, held: "failed" });
  await publishRemoteConversationsProjection({ client: rig.client, desktopKeys: rig.desktop, actorContext: actorFor(DEVICE), deviceId: DEVICE, now: new Date(clock.t) });
  const now = (): number => clock.t;
  const relay = createRelayClient({ baseUrl: RELAY, fetchImpl: rig.relayFetch, getDb: async () => rig.db, now });
  await relay.poll(); // the dashboard: the shop and the command authority
  const stack = await createCommandStack({ db: rig.db, relayBase: RELAY, fetch: rig.relayFetch, now });
  if (!stack) throw new Error("setup: no stack");
  const outbox = { list: stack.outbox.list, enqueue: async (i: Parameters<typeof stack.outbox.enqueue>[0]) => { const r = await stack.outbox.enqueue(i); if (r.ok) void stack.outbox.flush().catch(() => undefined); return r; } };
  const vault = createVault(); let host: InboxHost | null = null;
  const mount = createInboxMount({
    vault, loadScreen: async () => ({ attachInboxHost: (h: InboxHost) => { host = h; } }),
    makeHost: (p) => createInboxHost({ now, locale: () => "en", online: () => true, pcOff: () => false, readConversations: p.read, reload: p.reload, subscribeAll: p.subscribe, outbox, drafts: stack.drafts, authorityExpiresAt: stack.authorityExpiresAt, go: () => undefined }),
    openConversations: stack.openConversations,
    poll: async () => { await relay.poll("conversations"); await stack.refresh(); },
    subscribeAll: () => () => undefined,
  });
  expect(await mount.visit("inbox")).toBe(true); expect(mount.read().data).toBeNull(); // nothing sealed yet: no invented empty inbox
  await mount.reload(); expect(mount.lastReload()).toBe("ok");
  const h = host as InboxHost | null; if (!h) throw new Error("setup: no host");
  const ctrl = createInboxController(h); await ctrl.refresh();
  return { rig, stack, vault, mount, host: h, ctrl };
}
afterAll(() => { hoisted.rt.dispose(); });
beforeEach(async () => {
  await cleanDb(raw); await db.collaborationComment.deleteMany(); await db.businessAggregateVersion.deleteMany(); await db.message.deleteMany(); await db.conversation.deleteMany();
  vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
  hoisted.queue.mockImplementation(async (_c: unknown, input: { text: string; conversationId: string }) => {
    await db.message.create({ data: { conversationId: input.conversationId, body: input.text, direction: "outbound", timestamp: new Date() } });
    return { messageId: "msg-queued-1", effectKey: "effect-reply-1", replayed: false };
  });
});

describe("the phone chain: PC database -> relay -> phone -> vault -> inbox screen", () => {
  it("the held chat is first and says it is held on the PC; it has no button", async () => {
    const { ctrl } = await start();
    expect(rowIds(ctrl.html())[0]).toBe(HELD); expect(rowIds(ctrl.html())).toHaveLength(3);
    await ctrl.act("open-chat", { id: HELD }); const html = ctrl.html(); const b = bubble(html, bubbleIds(html)[0] ?? "");
    expect(b).toContain("Held on your PC"); expect(b).not.toMatch(/<button/);
  });
  it("a reply: the WhatsApp sender is called ONCE and the chip says handed to WhatsApp, never delivered; the same reply again is ALREADY_ANSWERED with no second send and no button", async () => {
    const { rig, stack, host, ctrl } = await start();
    const reply = { conversationId: UNREAD, text: "On the way", lastSeenMessageId: `${UNREAD}-m1` };
    expect((await host.enqueueReply(reply)).ok).toBe(true);
    await stack.outbox.flush(); await rig.runDesktop(); await stack.outbox.refresh();
    expect((await stack.outbox.list())[0]).toMatchObject({ state: "committed" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1); expect(hoisted.queue.mock.calls[0]?.[1]).toMatchObject({ text: "On the way", conversationId: UNREAD });
    await ctrl.refresh(); await ctrl.act("open-chat", { id: UNREAD }); const done = ctrl.html();
    expect(done).toContain("Handed to WhatsApp on your PC"); expect(done).not.toMatch(/delivered/i);
    clock.t += 1000;
    expect((await host.enqueueReply(reply)).ok).toBe(true);
    await stack.outbox.flush(); await rig.runDesktop(); await stack.outbox.refresh();
    expect((await stack.outbox.list())[1]).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
    await ctrl.refresh(); const again = ctrl.html();
    expect(again).not.toMatch(/Send anyway|Discard|Retry|Try again/i);
  });
  it("vault.lock(): nothing readable is drawn any more - no message, no name, no number - even with a chat open", async () => {
    const { vault, mount, ctrl } = await start();
    await ctrl.act("open-chat", { id: UNREAD }); const before = ctrl.html();
    expect(before).toContain("Is this still available?"); expect(before).toContain("Unread Ulla");
    vault.lock();
    expect(mount.read()).toMatchObject({ data: null }); await ctrl.refresh(); const after = ctrl.html();
    for (const secret of ["Is this still available?", "Unread Ulla", "Held Hana", "Plain Pat", "0661"]) expect(after, secret).not.toContain(secret);
  });
});
