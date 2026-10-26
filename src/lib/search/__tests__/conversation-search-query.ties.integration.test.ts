process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { db, dbRaw, shopContext } from "@/lib/db";
import { runConversationSearchIndexTick, searchConversationsIndexed } from "@/lib/search/conversation-search-runtime";
import { normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD: messages with EQUAL timestamps. SQLite does not define the order of equal timestamps, so the
 * old route's "50 newest messages" and its "last message" are whatever its query returned. The indexed search ranks
 * messages with its own queries; wherever the two could disagree it must hand the conversation to the old query, so
 * the whole answer (which conversations, and the lastMessage shown for each) stays the old route's. Synthetic data.
 */

type ProtectedClient = Parameters<typeof deriveShopBlindIndexes>[0];
const ensureKey = (): Promise<string[]> =>
  deriveShopBlindIndexes(db as unknown as ProtectedClient, ["probe"], { recordType: "SearchProjection", field: "probe" }, {
    shopContext,
    normalize: (value) => value,
  });

async function wipe(): Promise<void> {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await dbRaw.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}
async function tickUntilIdle(): Promise<void> {
  for (let turn = 1; turn <= 400; turn += 1) if (!(await runConversationSearchIndexTick()).changed) return;
  throw new Error("the indexer did not become idle in 400 turns");
}

/** What the old route returned for this query: the conversations and, for each, the message shown as lastMessage. */
async function oldRoute(rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  const conversations = await db.conversation.findMany({
    include: { messages: { orderBy: { timestamp: "desc" }, take: 50 } },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  return conversations
    .filter((conversation) => conversation.messages.some((message) => normalizeSearchText(message.body ?? "").includes(query)))
    .map((conversation) => ({ id: conversation.id, lastMessageBody: conversation.messages[0]?.body ?? null }));
}
async function indexedRoute(rawQuery: string) {
  const rows = await searchConversationsIndexed({ query: normalizeSearchText(rawQuery), canReadContact: true });
  return rows.map((row) => ({ id: row.id, lastMessageBody: row.lastMessage?.body ?? null }));
}

beforeEach(async () => {
  await ensureKey();
  await wipe();
});
afterAll(async () => {
  await wipe();
  await db.$disconnect();
  await dbRaw.$disconnect();
});

async function conversation(name: string, messages: Array<{ body: string; at: string }>) {
  const created = await db.conversation.create({
    data: { channel: "whatsapp", contactName: name, contactPhone: null, sourceId: `ties-${name}`, lastMessageAt: new Date("2026-10-20T10:00:00Z") },
  });
  for (const message of messages) {
    await db.message.create({ data: { conversationId: created.id, body: message.body, direction: "inbound", timestamp: new Date(message.at) } });
  }
  return created.id;
}

describe("messages with equal timestamps: the indexed answer is the old route's answer", () => {
  it("the two newest messages share a timestamp: the lastMessage shown is the old route's", async () => {
    const id = await conversation("Tied Newest", [
      { body: "ancien mot zqrold", at: "2026-10-01T08:00:00Z" },
      { body: "premier du couple", at: "2026-10-02T08:00:00Z" },
      { body: "second du couple", at: "2026-10-02T08:00:00Z" },
      { body: "troisieme du couple", at: "2026-10-02T08:00:00Z" },
    ]);
    await tickUntilIdle();
    const expected = await oldRoute("zqrold");
    expect(expected.map((row) => row.id)).toEqual([id]);
    expect(await indexedRoute("zqrold")).toEqual(expected);
  });

  it("the 50th and 51st newest messages share a timestamp: the conversation is found exactly when the old route finds it", async () => {
    const messages: Array<{ body: string; at: string }> = [];
    for (let index = 0; index < 60; index += 1) {
      // index 0..58 are one minute apart; the two messages at the 50-message boundary share a minute
      const minute = index === 9 || index === 10 ? 10 : index;
      messages.push({ body: index === 9 ? "borne zqrfirst" : index === 10 ? "borne zqrsecond" : `message numero ${index}`, at: new Date(Date.UTC(2026, 9, 1, 8, minute)).toISOString() });
    }
    const id = await conversation("Tied Boundary", messages);
    await tickUntilIdle();
    for (const word of ["zqrfirst", "zqrsecond"]) {
      const expected = await oldRoute(word);
      const actual = await indexedRoute(word);
      expect(actual, `word ${word}: old route finds ${JSON.stringify(expected.map((row) => row.id === id))}`).toEqual(expected);
    }
  });

  it("a word in a message far outside the 50 newest is not found, as before", async () => {
    const messages: Array<{ body: string; at: string }> = [];
    for (let index = 0; index < 70; index += 1) {
      messages.push({ body: index === 0 ? "tout premier zqrdeep" : `message numero ${index}`, at: new Date(Date.UTC(2026, 9, 1, 8, index)).toISOString() });
    }
    await conversation("Deep", messages);
    await tickUntilIdle();
    expect(await oldRoute("zqrdeep")).toEqual([]);
    expect(await indexedRoute("zqrdeep")).toEqual([]);
  });
});
