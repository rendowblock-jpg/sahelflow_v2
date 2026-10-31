import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  findMany: vi.fn(),
  intentFindMany: vi.fn(),
  effectFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  queryRaw: vi.fn(),
  unread: [] as Record<string, unknown>[],
  rest: [] as Record<string, unknown>[],
  heldChats: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
// held-messages.ts reads HELD_SEND_EFFECT_TYPES from this module: keep the real constant, replace only the reader.
vi.mock("./phone-today-counts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./phone-today-counts")>()),
  readPhoneTodayCounts: vi.fn(),
}));
vi.mock("@/lib/data/dashboard", () => ({ getDashboardStats: vi.fn(), getRecentOrders: vi.fn() }));
vi.mock("@/lib/data/analytics-data", () => ({ getDashboardAnalytics: vi.fn() }));
vi.mock("@/lib/orders/confirmation-workbench", () => ({ getConfirmationWorkbenchPage: vi.fn() }));
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const kit = await import("./__tests__/projection-kit");
  return {
    ...actual,
    db: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(kit.settingTx(h.settings)),
      conversation: { findMany: h.findMany },
      outboxIntent: { findMany: h.intentFindMany },
      whatsAppOutboundEffect: { findMany: h.effectFindMany },
      message: { findMany: h.messageFindMany },
      collaborationComment: { groupBy: vi.fn(async () => []) },
      businessAggregateVersion: { findMany: h.queryRaw }, // the note-version rows; there is no $queryRaw here, so a raw query on the canonical client would throw
    },
  };
});

import type { ConversationRow, ConversationsProjection } from "./contracts";
import { publishRemoteConversationsProjection, trimConversationsToBudget } from "./conversations-projection";
import { DEVICE_ID, NOW, actor, makeRig } from "./__tests__/projection-kit";

const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);
// Newest first, like the database query; the publisher must send oldest first.
const msg = (id: string, minutesAgo: number, extra: Record<string, unknown> = {}) => ({
  id, body: `text ${id}`, direction: "inbound", timestamp: at(minutesAgo), deliveryStatus: "sent", messageType: "text", ...extra,
});
const conv = (id: string, unreadCount: number, last: number, messages: unknown[]) => ({
  id, contactName: `Name ${id}`, contactPhone: `0661${id.length}00000`, status: "open", unreadCount,
  lastMessageAt: at(last), createdAt: at(999), messages,
  sourceId: "213661000000@s.whatsapp.net", draftBody: "secret draft", labels: "[\"vip\"]", assigneeId: "u1",
});
const ROW_KEYS = new Set(["id", "contactName", "phone", "status", "unread", "lastAt", "noteVersion", "messages"]);
const MSG_KEYS = new Set(["id", "direction", "text", "truncated", "at", "deliveryStatus", "held", "type"]);

beforeEach(() => {
  h.settings.clear();
  h.unread = [conv("c1", 2, 10, [msg("m3", 10, { direction: "outbound", deliveryStatus: "held" }), msg("m2", 11), msg("m1", 12)]), conv("c2", 1, 30, [msg("n1", 30)])];
  h.rest = [conv("c3", 0, 60, [msg("p1", 60, { messageType: "image", body: "https://mmg.whatsapp.net/secret.jpg" })])];
  h.queryRaw.mockReset().mockResolvedValue([{ aggregateId: "conversation:c1", version: 5 }]);
  h.heldChats = [];
  h.intentFindMany.mockReset().mockResolvedValue([]);
  h.effectFindMany.mockReset().mockResolvedValue([]);
  h.messageFindMany.mockReset().mockResolvedValue([]);
  h.findMany.mockReset().mockImplementation(async (args: { where: { id?: { in?: string[]; notIn?: string[] }; unreadCount?: { gt?: number } }; take: number }) => {
    const wanted = args.where.id?.in;
    if (wanted) return h.heldChats.filter((c) => wanted.includes(String(c.id))).slice(0, args.take);
    const skip = args.where.id?.notIn ?? [];
    return (args.where.unreadCount?.gt === 0 ? h.unread : h.rest).filter((c) => !skip.includes(String(c.id))).slice(0, args.take);
  });
});

async function run(context = actor("owner")) {
  const rig = makeRig();
  await publishRemoteConversationsProjection({
    client: rig.client as never, desktopKeys: rig.desktop, actorContext: context, deviceId: DEVICE_ID, now: NOW,
  });
  const envelope = rig.sent[0];
  if (!envelope) throw new Error("the publisher sent nothing");
  return { rig, envelope, payload: rig.open<ConversationsProjection>(envelope) };
}

describe("publishRemoteConversationsProjection", () => {
  it("sends unread first, then the rest, messages oldest first, with the exact row", async () => {
    const { payload, envelope } = await run();
    expect(envelope.messageType).toBe("projection.conversations");
    expect(envelope.sequence).toBe(1);
    expect(payload.conversations.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(payload.conversations[0]).toEqual({
      id: "c1", contactName: "Name c1", phone: "0661200000", status: "open", unread: 2,
      lastAt: "2026-10-31T00:50:00.000Z", noteVersion: 5,
      messages: [
        { id: "m1", direction: "in", text: "text m1", truncated: false, at: "2026-10-31T00:48:00.000Z", deliveryStatus: "sent", held: false, type: "text" },
        { id: "m2", direction: "in", text: "text m2", truncated: false, at: "2026-10-31T00:49:00.000Z", deliveryStatus: "sent", held: false, type: "text" },
        { id: "m3", direction: "out", text: "text m3", truncated: false, at: "2026-10-31T00:50:00.000Z", deliveryStatus: "held", held: true, type: "text" },
      ],
    });
    expect(payload.window).toEqual({ conversations: 3, perConversationMessages: 3 });
  });

  it("asks for 20 conversations x 10 messages, unread first, never archived", async () => {
    await run();
    const [first, second] = h.findMany.mock.calls.map((call) => call[0]);
    expect(first.where).toEqual({ archivedAt: null, unreadCount: { gt: 0 } });
    expect(first.take).toBe(20);
    expect(second.where).toEqual({ archivedAt: null, unreadCount: { lte: 0 } });
    expect(second.take).toBe(18);
    expect(first.select.messages.take).toBe(10);
    expect(first.select.messages.orderBy).toEqual([{ timestamp: "desc" }, { id: "desc" }]);
  });

  it("makes an attachment a placeholder: its type only, no url, no body", async () => {
    const { payload } = await run();
    expect(payload.conversations[2]?.messages[0]).toMatchObject({ id: "p1", type: "image", text: "", truncated: false });
    expect(JSON.stringify(payload)).not.toMatch(/whatsapp\.net|secret/);
  });

  it("copies only whitelisted fields (no source id, draft, labels, assignee)", async () => {
    const { payload } = await run();
    for (const c of payload.conversations) {
      for (const key of Object.keys(c)) expect(ROW_KEYS.has(key)).toBe(true);
      for (const m of c.messages) for (const key of Object.keys(m)) expect(MSG_KEYS.has(key)).toBe(true);
    }
  });

  it("cuts text at 1,000 characters and flags it (1,000 exactly is not cut)", async () => {
    h.unread = [conv("c1", 1, 5, [msg("a", 1, { body: "é".repeat(1001) }), msg("b", 2, { body: "é".repeat(1000) }), msg("c", 3, { body: "x".repeat(999) + "😀" })])];
    const { payload } = await run();
    const byId = Object.fromEntries((payload.conversations[0]?.messages ?? []).map((m) => [m.id, m]));
    expect(byId.a).toMatchObject({ truncated: true });
    expect(byId.a?.text).toHaveLength(1000);
    expect(byId.b).toMatchObject({ truncated: false });
    expect(byId.b?.text).toHaveLength(1000);
    expect(byId.c?.truncated).toBe(true);
    expect(byId.c?.text).toBe("x".repeat(999));
  });

  it("hides name and phone and never selects them without customers.contact.read", async () => {
    const { payload } = await run(actor("operator", ["shops.read", "conversations.read"]));
    for (const c of payload.conversations) {
      expect("contactName" in c).toBe(false);
      expect("phone" in c).toBe(false);
    }
    for (const call of h.findMany.mock.calls) {
      expect(call[0].select.contactName).toBeFalsy();
      expect(call[0].select.contactPhone).toBeFalsy();
    }
  });

  it("includes name and phone, and selects them, with customers.contact.read", async () => {
    const { payload } = await run(actor("operator", ["shops.read", "conversations.read", "customers.contact.read"]));
    expect(payload.conversations[0]).toMatchObject({ contactName: "Name c1" });
    expect(h.findMany.mock.calls[0]?.[0].select.contactName).toBeTruthy();
    expect(h.findMany.mock.calls[0]?.[0].select.contactPhone).toBeTruthy();
  });

  it("queries nothing and sends no message text without conversations.read", async () => {
    const { payload } = await run(actor("operator", ["shops.read", "orders.read"]));
    expect(h.findMany).not.toHaveBeenCalled();
    // The held lookup is behind the same gate: a member without conversations.read never makes it.
    expect(h.intentFindMany).not.toHaveBeenCalled();
    expect(h.effectFindMany).not.toHaveBeenCalled();
    expect(h.messageFindMany).not.toHaveBeenCalled();
    expect(payload).toEqual({ conversations: [], window: { conversations: 0, perConversationMessages: 0 } });
  });

  it("counts its own sequence per kind", async () => {
    await run();
    await run();
    expect([...h.settings.entries()]).toEqual([[`connected.projection.conversations.${DEVICE_ID}.sequence`, "2"]]);
  });
});

describe("trimConversationsToBudget", () => {
  const rows: ConversationRow[] = Array.from({ length: 8 }, (_, c) => ({
    id: `c${c}`, status: "open", unread: 0, lastAt: NOW.toISOString(), noteVersion: 0,
    messages: Array.from({ length: 10 }, (_, m) => ({
      id: `c${c}m${m}`, direction: "in" as const, text: "y".repeat(600), truncated: false,
      at: NOW.toISOString(), deliveryStatus: "sent", held: false, type: "text" as const,
    })),
  }));
  const full: ConversationsProjection = { conversations: rows, window: { conversations: 8, perConversationMessages: 10 } };
  const bytes = (p: ConversationsProjection) => Buffer.byteLength(JSON.stringify(p), "utf8");

  it("leaves a payload that fits exactly alone", () => {
    expect(trimConversationsToBudget(full, bytes(full))).toEqual(full);
  });

  it("drops the OLDEST messages first and keeps every conversation", () => {
    const trimmed = trimConversationsToBudget(full, bytes(full) - 1);
    expect(trimmed.conversations).toHaveLength(8);
    expect(trimmed.window.perConversationMessages).toBeLessThan(10);
    expect(trimmed.window.perConversationMessages).toBeGreaterThan(1);
    const kept = trimmed.window.perConversationMessages;
    expect(trimmed.conversations[0]?.messages.map((m) => m.id)).toEqual(
      rows[0]?.messages.slice(10 - kept).map((m) => m.id),
    );
    expect(bytes(trimmed)).toBeLessThanOrEqual(bytes(full) - 1);
  });

  it("then drops the LAST conversations, keeping one message each, and ends under any budget", () => {
    const budget = 3 * 900 + 300;
    const trimmed = trimConversationsToBudget(full, budget);
    expect(trimmed.window.perConversationMessages).toBe(1);
    expect(trimmed.conversations.length).toBeGreaterThan(0);
    expect(trimmed.conversations.length).toBeLessThan(8);
    expect(trimmed.conversations.map((c) => c.id)).toEqual(rows.slice(0, trimmed.conversations.length).map((c) => c.id));
    expect(trimmed.window.conversations).toBe(trimmed.conversations.length);
    expect(bytes(trimmed)).toBeLessThanOrEqual(budget);
    expect(trimConversationsToBudget(full, 10).conversations).toEqual([]);
  });
});

/** The reader's three reads, as fakes: intents -> effects -> messages (by id); the projection's own older-held read selects the body. */
function holdMessages(pairs: ReadonlyArray<readonly [string, string]>, older: unknown[] = []) {
  h.intentFindMany.mockResolvedValue(pairs.map(([messageId]) => ({ effectKey: `effect-${messageId}` })));
  h.effectFindMany.mockResolvedValue(pairs.map(([messageId]) => ({ effectKey: `effect-${messageId}`, messageId })));
  h.messageFindMany.mockImplementation(async (args: { select: { body?: boolean } }) =>
    args.select.body ? older : pairs.map(([id, conversationId]) => ({ id, conversationId })));
}

describe("held messages come from the outbox intents (fake reads)", () => {
  it("marks the held message and says held in both fields; the rest stay as they were", async () => {
    h.unread = [conv("c1", 1, 10, [msg("m2", 10, { direction: "outbound" }), msg("m1", 11)])];
    h.rest = [];
    h.heldChats = [h.unread[0] ?? {}];
    holdMessages([["m2", "c1"]]);
    const { payload } = await run();
    expect(payload.conversations.map((c) => c.id)).toEqual(["c1"]);
    const [m1, m2] = payload.conversations[0]?.messages ?? [];
    expect(m1).toMatchObject({ id: "m1", held: false, deliveryStatus: "sent" });
    expect(m2).toMatchObject({ id: "m2", held: true, deliveryStatus: "held" });
  });

  it("reads the held chats first (counted against the 20) and keeps them out of the other two queries", async () => {
    h.heldChats = [conv("old", 0, 9000, [msg("h1", 9000, { direction: "outbound" })])];
    h.unread = [conv("c1", 2, 10, [msg("m1", 10)])];
    h.rest = [conv("c3", 0, 60, [msg("p1", 60)])];
    holdMessages([["h1", "old"]]);
    const { payload } = await run();
    expect(payload.conversations.map((c) => c.id)).toEqual(["old", "c1", "c3"]);
    const [held, unread, rest] = h.findMany.mock.calls.map((call) => call[0]);
    expect(held.where).toEqual({ archivedAt: null, id: { in: ["old"] } });
    expect(held.take).toBe(20);
    expect(unread.where).toEqual({ archivedAt: null, unreadCount: { gt: 0 }, id: { notIn: ["old"] } });
    expect(unread.take).toBe(19);
    expect(rest.where).toEqual({ archivedAt: null, unreadCount: { lte: 0 }, id: { notIn: ["old"] } });
    expect(rest.take).toBe(18);
  });

  it("fetches the held messages older than the window in ONE query for all chats and merges them, oldest first", async () => {
    h.unread = [conv("c1", 1, 10, [msg("a2", 10), msg("a1", 11)]), conv("c2", 1, 12, [msg("b1", 12)])];
    h.rest = [];
    h.heldChats = [...h.unread];
    const oldA = msg("oa", 900, { direction: "outbound" });
    const oldB = msg("ob", 800, { direction: "outbound", body: "x".repeat(1500) });
    holdMessages([["oa", "c1"], ["ob", "c2"]], [oldA, oldB]);
    const { payload } = await run();
    const [c1, c2] = payload.conversations;
    expect(c1?.messages.map((m) => m.id)).toEqual(["oa", "a1", "a2"]);
    expect(c2?.messages.map((m) => m.id)).toEqual(["ob", "b1"]);
    expect(c1?.messages[0]).toMatchObject({ held: true, deliveryStatus: "held" });
    expect(c2?.messages[0]).toMatchObject({ held: true, truncated: true });
    const withBody = h.messageFindMany.mock.calls.filter((call) => call[0].select.body);
    expect(withBody).toHaveLength(1);
    expect(withBody[0]?.[0].where).toEqual({ id: { in: ["oa", "ob"] } });
    expect(h.messageFindMany).toHaveBeenCalledTimes(2); // the reader's + this one: not one per chat
  });

  it("does not select name or phone in the held-chat query either, without customers.contact.read", async () => {
    h.heldChats = [conv("old", 0, 9000, [msg("h1", 9000)])];
    holdMessages([["h1", "old"]]);
    const { payload } = await run(actor("operator", ["shops.read", "conversations.read"]));
    expect("contactName" in (payload.conversations[0] ?? {})).toBe(false);
    expect(h.findMany.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of h.findMany.mock.calls) {
      expect(call[0].select.contactName).toBeFalsy();
      expect(call[0].select.contactPhone).toBeFalsy();
    }
  });

  it("FAILS (and publishes nothing) when the held lookup fails, instead of saying nothing is held", async () => {
    h.intentFindMany.mockRejectedValue(new Error("db is locked"));
    const rig = makeRig();
    await expect(
      publishRemoteConversationsProjection({ client: rig.client as never, desktopKeys: rig.desktop, actorContext: actor("owner"), deviceId: DEVICE_ID, now: NOW }),
    ).rejects.toThrow("db is locked");
    expect(rig.sent).toEqual([]);
    expect(h.settings.size).toBe(0); // the sequence was not even bumped
  });
});

describe("trimConversationsToBudget keeps held messages longest", () => {
  const chatOf = (id: string, flags: ReadonlyArray<readonly [string, boolean]>): ConversationRow => ({
    id, status: "open", unread: 0, lastAt: NOW.toISOString(), noteVersion: 0,
    messages: flags.map(([mid, held]) => ({
      id: mid, direction: "out" as const, text: "y".repeat(600), truncated: false, at: NOW.toISOString(),
      deliveryStatus: held ? "held" : "sent", held, type: "text" as const,
    })),
  });
  const wrap = (rows: ConversationRow[]): ConversationsProjection => ({
    conversations: rows,
    window: { conversations: rows.length, perConversationMessages: rows.reduce((most, r) => Math.max(most, r.messages.length), 0) },
  });
  const bytes = (p: ConversationsProjection) => Buffer.byteLength(JSON.stringify(p), "utf8");
  const ids = (p: ConversationsProjection, i: number) => p.conversations[i]?.messages.map((m) => m.id);

  it("cuts the oldest PLAIN messages first and keeps an old held one", () => {
    const full = wrap([chatOf("c", [["held", true], ["p1", false], ["p2", false], ["p3", false], ["p4", false], ["p5", false]])]);
    const trimmed = trimConversationsToBudget(full, bytes(full) - 1);
    expect(ids(trimmed, 0)).toEqual(["held", "p2", "p3", "p4", "p5"]);
  });

  it("with a budget so small that 3 of 4 messages must go, the held one is the one that stays", () => {
    const full = wrap([chatOf("c", [["held", true], ["p1", false], ["p2", false], ["p3", false]])]);
    const justHeld = wrap([chatOf("c", [["held", true]])]);
    const trimmed = trimConversationsToBudget(full, bytes(justHeld));
    expect(ids(trimmed, 0)).toEqual(["held"]);
    expect(bytes(trimmed)).toBeLessThanOrEqual(bytes(justHeld));
  });

  it("drops chats without a held message before a chat with one, wherever it sits in the list", () => {
    const full = wrap([chatOf("p1", [["a", false]]), chatOf("p2", [["b", false]]), chatOf("h", [["held", true]])]);
    const justHeld = wrap([chatOf("h", [["held", true]])]);
    const trimmed = trimConversationsToBudget(full, bytes(justHeld));
    expect(trimmed.conversations.map((c) => c.id)).toEqual(["h"]);
    expect(trimmed.window).toEqual({ conversations: 1, perConversationMessages: 1 });
  });

  it("drops the LAST held chat only after every plain chat is gone", () => {
    const full = wrap([chatOf("h1", [["x", true]]), chatOf("h2", [["y", true]]), chatOf("p", [["z", false]])]);
    const two = wrap([chatOf("h1", [["x", true]]), chatOf("h2", [["y", true]])]);
    const one = wrap([chatOf("h1", [["x", true]])]);
    expect(trimConversationsToBudget(full, bytes(two)).conversations.map((c) => c.id)).toEqual(["h1", "h2"]);
    expect(trimConversationsToBudget(full, bytes(one)).conversations.map((c) => c.id)).toEqual(["h1"]);
  });
});
