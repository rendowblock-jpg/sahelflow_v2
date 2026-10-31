process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// The context minted by the real session flow is a WeakSet-branded object. These tests hand a plain object, so the brand check
// (and only that) is replaced, exactly as desktop-projection.test.ts does. The database, the protected client, the raw SQL and
// the field gates all run for real.
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { DEVICE_ID, NOW, actor, makeRig } from "./__tests__/projection-kit";
import type { ConversationsProjection, OrdersProjection } from "./contracts";
import { publishRemoteConversationsProjection } from "./conversations-projection";
import { publishRemoteOrdersProjection, readNoteCounts, readNoteVersions } from "./orders-projection";

/**
 * The two phone readers against a REAL SQLite file and the REAL protected client (`db`): the unit tests of the
 * publishers mock the client, so the raw SQL, the groupBy, the nested message read of an encrypted body and the
 * field gates ran only against a fake until this file.
 */
const raw = db as unknown as PrismaClient;

async function clean(): Promise<void> {
  await cleanDb(raw);
  await db.collaborationComment.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
}

let seq = 0;
async function comment(entityType: string, entityId: string): Promise<void> {
  seq += 1;
  await db.collaborationComment.create({
    data: { id: `cm-${seq}`, entityType, entityId, authorMemberId: "member-1", bodyJson: "{}", commandId: `cmd-note-${seq}` },
  });
}
async function aggregate(type: string, id: string, version: number): Promise<void> {
  await db.businessAggregateVersion.create({ data: { aggregateType: type, aggregateId: id, version } });
}

beforeEach(async () => {
  await clean();
});

describe("readNoteCounts and readNoteVersions: real database", () => {
  it("counts notes per entity of the asked type only, and says 0 nothing for an entity without notes", async () => {
    await comment("order", "o1");
    await comment("order", "o1");
    await comment("order", "o2");
    await comment("conversation", "o1");
    const counts = await readNoteCounts("order", ["o1", "o2", "o3"]);
    expect(Object.fromEntries(counts)).toEqual({ o1: 2, o2: 1 });
    expect((await readNoteCounts("conversation", ["o1"])).get("o1")).toBe(1);
    expect((await readNoteCounts("order", [])).size).toBe(0);
  });

  it("reads the comment version the notes command checks, per type, and ignores other aggregates", async () => {
    await aggregate("collaboration-comments", "order:o1", 4);
    await aggregate("collaboration-comments", "conversation:o1", 9);
    await aggregate("whatsapp-message", "order:o1", 77);
    const versions = await readNoteVersions("order", ["o1", "o2"]);
    expect(Object.fromEntries(versions)).toEqual({ o1: 4 });
    expect(Object.fromEntries(await readNoteVersions("conversation", ["o1"]))).toEqual({ o1: 9 });
  });
});

async function pendingOrderWithNote() {
  const customer = await seedCustomer(raw, { name: "Karim Haddad", phone: "0661000111" });
  const product = await seedProduct(raw);
  const order = await seedOrder(raw, { status: "pending", totalPrice: 4200, customerId: customer.id, productId: product.id });
  await seedOrder(raw, { status: "confirmed", totalPrice: 900, customerId: customer.id, productId: product.id });
  await seedOrder(raw, { status: "draft", totalPrice: 100, customerId: customer.id, productId: product.id });
  await comment("order", order.id);
  await aggregate("collaboration-comments", `order:${order.id}`, 3);
  return order;
}

async function publishOrders(context = actor("owner")) {
  const rig = makeRig();
  await publishRemoteOrdersProjection({ client: rig.client as never, desktopKeys: rig.desktop, actorContext: context, deviceId: DEVICE_ID, now: NOW });
  const envelope = rig.sent[rig.sent.length - 1];
  if (!envelope) throw new Error("the publisher sent nothing");
  return rig.open<OrdersProjection>(envelope);
}

describe("publishRemoteOrdersProjection: real database", () => {
  it("the owner gets the pending order first with price, phone, items and note numbers; drafts are left out", async () => {
    const order = await pendingOrderWithNote();
    const payload = await publishOrders();
    expect(payload.orders.map((row) => row.status)).toEqual(["pending", "confirmed"]);
    const first = payload.orders[0];
    expect(first).toMatchObject({
      id: order.id,
      status: "pending",
      totalPrice: 4200,
      phone: "0555123456",
      customerName: "Karim Haddad",
      noteCount: 1,
      noteVersion: 3,
    });
    expect(first?.items).toEqual([{ name: "Test Product", qty: 2 }]);
    expect(payload.window).toEqual({ shown: 2, pendingTotal: 1, truncated: false });
  });

  it("a member without the financial and contact permissions gets neither the amount nor the phone", async () => {
    await pendingOrderWithNote();
    const payload = await publishOrders(actor("operator", ["shops.read", "orders.read"]));
    const first = payload.orders[0];
    expect(first?.status).toBe("pending");
    expect(first).not.toHaveProperty("totalPrice");
    expect(first).not.toHaveProperty("phone");
    expect(first).not.toHaveProperty("address");
    expect(first).not.toHaveProperty("customerName");
    expect(JSON.stringify(payload)).not.toContain("0555123456");
  });

  it("a member who may not read orders gets an empty window and nothing is queried into it", async () => {
    await pendingOrderWithNote();
    const payload = await publishOrders(actor("operator", ["shops.read", "conversations.read"]));
    expect(payload.orders).toEqual([]);
    expect(payload.window).toEqual({ shown: 0, pendingTotal: 0, truncated: false });
  });
});

async function conversationWithMessages() {
  const conversation = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Samira B",
      contactPhone: "213661234567",
      sourceId: "213661234567@s.whatsapp.net",
      unreadCount: 2,
      lastMessageAt: new Date("2026-10-31T00:50:00.000Z"),
    },
  });
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 31, 0, minute));
  await db.message.create({ data: { conversationId: conversation.id, body: "Salam, bghit nchri", direction: "inbound", timestamp: at(10) } });
  await db.message.create({ data: { conversationId: conversation.id, body: "Ahlan, ch7al?", direction: "outbound", timestamp: at(20) } });
  await db.message.create({ data: { conversationId: conversation.id, body: "https://files.example/photo.jpg", direction: "inbound", timestamp: at(30), messageType: "image" } });
  await db.conversation.create({ data: { channel: "whatsapp", contactName: "Old chat", sourceId: "x@s.whatsapp.net", unreadCount: 0, archivedAt: new Date("2026-10-01T00:00:00.000Z") } });
  await aggregate("collaboration-comments", `conversation:${conversation.id}`, 5);
  return conversation;
}

async function publishConversations(context = actor("owner")) {
  const rig = makeRig();
  await publishRemoteConversationsProjection({ client: rig.client as never, desktopKeys: rig.desktop, actorContext: context, deviceId: DEVICE_ID, now: NOW });
  const envelope = rig.sent[rig.sent.length - 1];
  if (!envelope) throw new Error("the publisher sent nothing");
  return rig.open<ConversationsProjection>(envelope);
}

describe("publishRemoteConversationsProjection: real database", () => {
  it("sends the decrypted text oldest first, an image as a placeholder with no url, and leaves archived chats out", async () => {
    const conversation = await conversationWithMessages();
    const payload = await publishConversations();
    expect(payload.conversations.map((row) => row.id)).toEqual([conversation.id]);
    const row = payload.conversations[0];
    expect(row).toMatchObject({ contactName: "Samira B", phone: "213661234567", unread: 2, noteVersion: 5 });
    expect(row?.messages.map((message) => message.text)).toEqual(["Salam, bghit nchri", "Ahlan, ch7al?", ""]);
    expect(row?.messages.map((message) => message.direction)).toEqual(["in", "out", "in"]);
    expect(row?.messages[2]?.type).toBe("image");
    // Nothing that looks like stored ciphertext or a media address reaches the phone.
    const wire = JSON.stringify(payload);
    expect(wire).not.toContain("files.example");
    expect(wire).not.toMatch(/enc:|v1:[A-Za-z0-9+/=]{20,}/);
  });

  it("without the contact permission the name and number are never read", async () => {
    await conversationWithMessages();
    const payload = await publishConversations(actor("operator", ["shops.read", "conversations.read"]));
    const row = payload.conversations[0];
    expect(row).not.toHaveProperty("contactName");
    expect(row).not.toHaveProperty("phone");
    expect(JSON.stringify(payload)).not.toContain("213661234567");
    expect(row?.messages).toHaveLength(3);
  });

  it("without conversations.read the window is empty", async () => {
    await conversationWithMessages();
    const payload = await publishConversations(actor("operator", ["shops.read", "orders.read"]));
    expect(payload.conversations).toEqual([]);
  });
});
