import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestPrisma, disconnectTestPrisma } from "@/lib/data/__tests__/helpers";

/**
 * PB-CONV-SEARCH-LOAD, slice 2: the SQLite triggers that keep the conversation-search index honest.
 * Real SQLite, real migration. The triggers never read a message body (it is sealed); they only drop
 * the index rows of whatever changed or disappeared and queue it for the app to index again.
 */

let db: PrismaClient;
let sequence = 0;

async function rows<T>(sql: string, ...args: unknown[]): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(sql, ...args);
}
async function count(table: string, where = "1=1", ...args: unknown[]): Promise<number> {
  const result = await rows<{ n: bigint | number }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`, ...args);
  return Number(result[0]?.n ?? 0);
}
async function wipeIndex(): Promise<void> {
  for (const table of [
    "ConversationSearchToken",
    "ConversationSearchDoc",
    "ConversationSearchDirty",
  ]) {
    await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}
async function clearDirty(): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchDirty"`);
}
async function newConversation(contactName = "Karim") {
  sequence += 1;
  return db.conversation.create({
    data: { channel: "whatsapp", contactName, contactPhone: "0555123456", sourceId: `trigger-test-${sequence}` },
  });
}
async function newMessage(conversationId: string, body = "bonjour") {
  return db.message.create({
    data: { conversationId, body, direction: "inbound", timestamp: new Date("2026-10-25T10:00:00Z") },
  });
}
/** A document the indexer would have written, with some token rows. */
async function indexDoc(kind: "M" | "C", entityId: string, conversationId: string, hashes: number[]) {
  await db.$executeRawUnsafe(
    `INSERT INTO "ConversationSearchDoc" ("kind","entityId","conversationId") VALUES (?,?,?)`,
    kind,
    entityId,
    conversationId,
  );
  const [doc] = await rows<{ docId: bigint | number }>(
    `SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind"=? AND "entityId"=?`,
    kind,
    entityId,
  );
  for (const hash of hashes) {
    await db.$executeRawUnsafe(
      `INSERT INTO "ConversationSearchToken" ("docId","tokenHash") VALUES (?,?)`,
      Number(doc?.docId),
      hash,
    );
  }
}
const docCount = (kind: string, entityId: string) =>
  count("ConversationSearchDoc", `"kind"=? AND "entityId"=?`, kind, entityId);
const dirtyCount = (kind: string, entityId: string) =>
  count("ConversationSearchDirty", `"kind"=? AND "entityId"=?`, kind, entityId);

beforeEach(async () => {
  db = await createTestPrisma();
  await wipeIndex();
});
afterEach(async () => {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  await wipeIndex();
  await disconnectTestPrisma(db);
});

describe("conversation search index triggers", () => {
  it("queues a new conversation and a new message for indexing", async () => {
    const conversation = await newConversation();
    const message = await newMessage(conversation.id);

    expect(await dirtyCount("C", conversation.id)).toBe(1);
    expect(await dirtyCount("M", message.id)).toBe(1);
    const [queued] = await rows<{ conversationId: string }>(
      `SELECT "conversationId" FROM "ConversationSearchDirty" WHERE "kind"='M' AND "entityId"=?`,
      message.id,
    );
    expect(queued?.conversationId).toBe(conversation.id);
  });

  it("does nothing for a delivery-status update or an unread-counter update", async () => {
    const conversation = await newConversation();
    const message = await newMessage(conversation.id);
    await indexDoc("M", message.id, conversation.id, [11, 22]);
    await indexDoc("C", conversation.id, conversation.id, [33]);
    await clearDirty();

    await db.message.update({ where: { id: message.id }, data: { deliveryStatus: "read" } });
    await db.conversation.update({ where: { id: conversation.id }, data: { unreadCount: 4 } });

    expect(await docCount("M", message.id)).toBe(1);
    expect(await docCount("C", conversation.id)).toBe(1);
    expect(await count("ConversationSearchToken")).toBe(3);
    expect(await count("ConversationSearchDirty")).toBe(0);
  });

  it("drops the rows of a message whose body changed and queues it again, leaving the others alone", async () => {
    const conversation = await newConversation();
    const changed = await newMessage(conversation.id, "ancien texte");
    const untouched = await newMessage(conversation.id, "autre texte");
    await indexDoc("M", changed.id, conversation.id, [11, 22]);
    await indexDoc("M", untouched.id, conversation.id, [44]);
    await clearDirty();

    await db.message.update({ where: { id: changed.id }, data: { body: "nouveau texte" } });
    await db.message.update({ where: { id: changed.id }, data: { body: "encore un texte" } });

    expect(await docCount("M", changed.id)).toBe(0);
    expect(await count("ConversationSearchToken")).toBe(1);
    expect(await docCount("M", untouched.id)).toBe(1);
    expect(await dirtyCount("M", changed.id)).toBe(1);
    expect(await dirtyCount("M", untouched.id)).toBe(0);
  });

  it("re-queues a message that moves to another conversation (the conversation id is part of the hash)", async () => {
    const first = await newConversation("Karim");
    const second = await newConversation("Lydia");
    const message = await newMessage(first.id);
    await indexDoc("M", message.id, first.id, [11]);
    await clearDirty();

    await db.message.update({ where: { id: message.id }, data: { conversationId: second.id } });

    expect(await docCount("M", message.id)).toBe(0);
    const [queued] = await rows<{ conversationId: string }>(
      `SELECT "conversationId" FROM "ConversationSearchDirty" WHERE "kind"='M' AND "entityId"=?`,
      message.id,
    );
    expect(queued?.conversationId).toBe(second.id);
  });

  it("removes a deleted message's document, tokens and queue entry", async () => {
    const conversation = await newConversation();
    const message = await newMessage(conversation.id);
    await indexDoc("M", message.id, conversation.id, [11, 22, 33]);
    expect(await dirtyCount("M", message.id)).toBe(1);

    await db.message.delete({ where: { id: message.id } });

    expect(await docCount("M", message.id)).toBe(0);
    expect(await count("ConversationSearchToken")).toBe(0);
    expect(await dirtyCount("M", message.id)).toBe(0);
  });

  it("drops the contact document when the name or phone changes, and only then", async () => {
    const conversation = await newConversation("Karim");
    await indexDoc("C", conversation.id, conversation.id, [55, 66]);
    await clearDirty();

    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    expect(await docCount("C", conversation.id)).toBe(1);
    expect(await dirtyCount("C", conversation.id)).toBe(0);

    await db.conversation.update({ where: { id: conversation.id }, data: { contactName: "Karim B." } });
    expect(await docCount("C", conversation.id)).toBe(0);
    expect(await count("ConversationSearchToken")).toBe(0);
    expect(await dirtyCount("C", conversation.id)).toBe(1);

    await indexDoc("C", conversation.id, conversation.id, [77]);
    await clearDirty();
    await db.conversation.update({ where: { id: conversation.id }, data: { contactPhone: "0666000000" } });
    expect(await docCount("C", conversation.id)).toBe(0);
    expect(await dirtyCount("C", conversation.id)).toBe(1);
  });

  it("leaves nothing of a deleted conversation behind, messages included (foreign-key cascade), and nothing of another one is touched", async () => {
    const [foreignKeys] = await rows<{ foreign_keys: bigint | number }>(`PRAGMA foreign_keys`);
    expect(Number(foreignKeys?.foreign_keys)).toBe(1);

    const doomed = await newConversation("Karim");
    const kept = await newConversation("Lydia");
    const doomedMessages = [await newMessage(doomed.id), await newMessage(doomed.id)];
    const keptMessage = await newMessage(kept.id);
    for (const message of doomedMessages) await indexDoc("M", message.id, doomed.id, [1, 2, 3]);
    await indexDoc("C", doomed.id, doomed.id, [4, 5]);
    await indexDoc("M", keptMessage.id, kept.id, [6, 7]);
    await indexDoc("C", kept.id, kept.id, [8]);

    await db.conversation.delete({ where: { id: doomed.id } });

    expect(await count("ConversationSearchDoc", `"conversationId"=?`, doomed.id)).toBe(0);
    expect(await count("ConversationSearchDirty", `"conversationId"=?`, doomed.id)).toBe(0);
    expect(await count("Message", `"conversationId"=?`, doomed.id)).toBe(0);
    // The only token rows left are the kept conversation's (2 + 1).
    expect(await count("ConversationSearchToken")).toBe(3);
    expect(await docCount("M", keptMessage.id)).toBe(1);
    expect(await docCount("C", kept.id)).toBe(1);
  });

  it("has exactly one state row, scheme 1, and no index document that was not written by the indexer", async () => {
    const states = await rows<{ id: string; scheme: bigint | number; completedAt: unknown }>(
      `SELECT "id","scheme","completedAt" FROM "ConversationSearchState"`,
    );
    expect(states).toHaveLength(1);
    expect(states[0]?.id).toBe("conversation-index");
    expect(Number(states[0]?.scheme)).toBe(1);
    expect(states[0]?.completedAt ?? null).toBeNull();
    // Nothing is copied out of Message or Conversation by the migration itself: after the
    // clean-up above the documents are only what the test writes.
    expect(await count("ConversationSearchDoc")).toBe(0);
  });
});
