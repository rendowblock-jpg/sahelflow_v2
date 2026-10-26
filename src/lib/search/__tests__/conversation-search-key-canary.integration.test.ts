import { createHmac } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestPrisma, disconnectTestPrisma } from "@/lib/data/__tests__/helpers";
import { runConversationSearchIndexStep, type IndexerClient, type IndexerPorts, type SealedContact, type SealedMessage } from "@/lib/search/conversation-search-index";
import { searchConversationIndex, searchConversationWindow, type QueryPorts } from "@/lib/search/conversation-search-query";
import type { BlindIndexDeriver } from "@/lib/search/conversation-search-tokens";
import { normalizeSearchText } from "@/lib/search/universal-search";

/**
 * The key canary of the conversation-search index (PB-CONV-SEARCH-LOAD). The index stores hashes made under the shop's
 * blind-index key. If the key row is re-created while the index file content stays (a restored backup, a re-created
 * data folder), every stored hash is stale and the index would silently miss results. The indexer therefore keeps ONE
 * document of kind 'K' whose single token is a constant hashed under the current key; the query trusts the index only
 * while that token is there. Real SQLite test database; invented shop; keys are two fixed test keys.
 */
const KEY_A = Buffer.from("conversation-search-canary-key-A");
const KEY_B = Buffer.from("conversation-search-canary-key-B");
const deriveWith =
  (key: Buffer): BlindIndexDeriver =>
  async (values) =>
    values.map((value) => createHmac("sha256", key).update(value).digest("hex"));
const unseal = (body: string | null): string | null => (body === null ? null : body.replace(/^sealed:/u, ""));

let db: PrismaClient;
const indexerPorts = (key: Buffer): IndexerPorts => ({
  client: db as unknown as IndexerClient,
  derive: deriveWith(key),
  openBody: async (message: SealedMessage) => String(unseal(message.body)),
  openContact: async (contact: SealedContact) => ({ name: contact.contactName, phone: contact.contactPhone }),
});
type Calls = { opened: string[][]; loaded: string[][] };
const queryPorts = (key: Buffer, calls: Calls): QueryPorts => ({
  client: db as unknown as QueryPorts["client"],
  derive: deriveWith(key),
  listWindowIds: async () =>
    (await db.conversation.findMany({ select: { id: true }, orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }], take: 500 })).map((row) => row.id),
  loadConversations: async (ids) => {
    calls.loaded.push([...ids]);
    const rows = await db.conversation.findMany({ where: { id: { in: [...ids] } }, include: { messages: { orderBy: { timestamp: "desc" }, take: 50 } } });
    return rows.map((row) => ({ ...row, messages: row.messages.map((message) => ({ ...message, body: unseal(message.body) })) }));
  },
  loadConversationRows: async (ids) => db.conversation.findMany({ where: { id: { in: [...ids] } } }),
  openMessages: async (ids) => {
    calls.opened.push([...ids]);
    const rows = await db.message.findMany({ where: { id: { in: [...ids] } } });
    return rows.map((row) => ({ id: row.id, conversationId: row.conversationId, body: unseal(row.body), direction: row.direction, timestamp: row.timestamp }));
  },
  drain: async () => undefined,
});

async function wipe(): Promise<void> {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}
async function stepsUntilIdle(key: Buffer): Promise<number> {
  for (let step = 1; step <= 200; step += 1) {
    const result = await runConversationSearchIndexStep(indexerPorts(key));
    if ("skipped" in result || !result.changed) return step;
  }
  throw new Error("the indexer did not become idle in 200 steps");
}
async function count(sql: string, ...values: unknown[]): Promise<number> {
  const [row] = await db.$queryRawUnsafe<Array<{ n: number | bigint }>>(sql, ...values);
  return Number(row?.n ?? 0);
}
const canaryDocs = () => count(`SELECT COUNT(*) AS n FROM "ConversationSearchDoc" WHERE "kind" = 'K'`);
const canaryTokens = () =>
  db.$queryRawUnsafe<Array<{ tokenHash: number | bigint }>>(
    `SELECT t."tokenHash" AS "tokenHash" FROM "ConversationSearchToken" t JOIN "ConversationSearchDoc" d ON d."docId" = t."docId" WHERE d."kind" = 'K'`,
  ).then((rows) => rows.map((row) => Number(row.tokenHash)));
async function answer(search: typeof searchConversationIndex, key: Buffer, query: string, calls: Calls) {
  const rows = await search(queryPorts(key, calls), { query: normalizeSearchText(query), canReadContact: true });
  return rows.map((row) => ({ id: row.id, matchType: row.matchType }));
}
const fresh = (): Calls => ({ opened: [], loaded: [] });

let ids: Record<string, string>;
async function seedShop(): Promise<void> {
  ids = {};
  const spec: Array<{ key: string; name: string; at: string; messages: string[] }> = [
    { key: "amine", name: "Amine Canarytest", at: "2026-10-20T12:00:00Z", messages: ["bonjour livraison alger", "merci beaucoup"] },
    { key: "karim", name: "Karim Canarytest", at: "2026-10-20T11:00:00Z", messages: ["paiement a la livraison", "ok bien recu"] },
    { key: "nadia", name: "Nadia Canarytest", at: "2026-10-20T10:00:00Z", messages: ["la coque samsung est dispo"] },
  ];
  for (const [position, entry] of spec.entries()) {
    const conversation = await db.conversation.create({
      data: { channel: "whatsapp", contactName: entry.name, contactPhone: `055500990${position}`, sourceId: `canary-${entry.key}`, lastMessageAt: new Date(entry.at) },
    });
    ids[entry.key] = conversation.id;
    for (const [at, body] of entry.messages.entries()) {
      await db.message.create({ data: { conversationId: conversation.id, body: `sealed:${body}`, direction: "inbound", timestamp: new Date(Date.parse(entry.at) - at * 60_000) } });
    }
  }
}

beforeAll(async () => {
  db = await createTestPrisma();
});
beforeEach(async () => {
  await wipe();
  await seedShop();
});
afterAll(async () => {
  await wipe();
  await disconnectTestPrisma(db);
});

describe("key canary: an index built under another key is never trusted", () => {
  it("one K document with one token is written by the indexer, and an idle step leaves it alone", async () => {
    await stepsUntilIdle(KEY_A);
    expect(await canaryDocs()).toBe(1);
    const tokens = await canaryTokens();
    expect(tokens).toHaveLength(1);
    const before = await count(`SELECT "docId" AS n FROM "ConversationSearchDoc" WHERE "kind" = 'K'`);
    expect(await runConversationSearchIndexStep(indexerPorts(KEY_A))).toEqual({ changed: false });
    expect(await count(`SELECT "docId" AS n FROM "ConversationSearchDoc" WHERE "kind" = 'K'`)).toBe(before);
  });

  it("with the matching key the index answers (candidate bodies only, no conversation read in full)", async () => {
    await stepsUntilIdle(KEY_A);
    const oracle = await answer(searchConversationWindow, KEY_A, "livraison", fresh());
    const calls = fresh();
    expect(await answer(searchConversationIndex, KEY_A, "livraison", calls)).toEqual(oracle);
    expect(oracle.map((row) => row.id)).toEqual([ids.amine, ids.karim]);
    expect(calls.loaded.flat()).toEqual([]);
    expect(calls.opened.flat().length).toBeGreaterThan(0);
  });

  it("(a) a database restored with an index built under key A, opened under key B, answers the old way with the old answer", async () => {
    await stepsUntilIdle(KEY_A);
    const oracle = await answer(searchConversationWindow, KEY_B, "livraison", fresh());
    expect(oracle).toHaveLength(2);
    for (const query of ["livraison", "coque", "canarytest", "0555009900"]) {
      const calls = fresh();
      const expected = await answer(searchConversationWindow, KEY_B, query, fresh());
      const actual = await answer(searchConversationIndex, KEY_B, query, calls);
      expect(actual, `query ${query}: the stale index must not hide a result (old route: ${expected.length})`).toEqual(expected);
      expect(calls.loaded.flat().length, `query ${query} must be read in full`).toBeGreaterThanOrEqual(3);
    }
  });

  it("(b) the tick under key B re-seeds the canary, rebuilds the index under B, and the next searches use the index again", async () => {
    await stepsUntilIdle(KEY_A);
    const [stored] = await canaryTokens();
    await stepsUntilIdle(KEY_B);
    const tokens = await canaryTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).not.toBe(stored);
    expect(await canaryDocs()).toBe(1);
    for (const query of ["livraison", "coque", "canarytest", "0555009900"]) {
      const calls = fresh();
      expect(await answer(searchConversationIndex, KEY_B, query, calls)).toEqual(await answer(searchConversationWindow, KEY_B, query, fresh()));
      expect(calls.loaded.flat(), `query ${query} must be answered by the rebuilt index`).toEqual([]);
    }
    expect((await answer(searchConversationIndex, KEY_B, "livraison", fresh())).map((row) => row.id)).toEqual([ids.amine, ids.karim]);
  });

  it("a missing canary with documents in the index also means the old way, and the tick rebuilds it", async () => {
    await stepsUntilIdle(KEY_A);
    await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchToken" WHERE "docId" IN (SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'K')`);
    await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchDoc" WHERE "kind" = 'K'`);
    const calls = fresh();
    expect(await answer(searchConversationIndex, KEY_A, "livraison", calls)).toEqual(await answer(searchConversationWindow, KEY_A, "livraison", fresh()));
    expect(calls.loaded.flat().length).toBeGreaterThanOrEqual(3);
    await stepsUntilIdle(KEY_A);
    expect(await canaryDocs()).toBe(1);
    const again = fresh();
    expect(await answer(searchConversationIndex, KEY_A, "livraison", again)).toHaveLength(2);
    expect(again.loaded.flat()).toEqual([]);
  });

  it("(c) a search never returns the canary, even for a conversation whose id is 'canary'", async () => {
    await db.conversation.create({ data: { id: "canary", channel: "whatsapp", contactName: "Canary Contact", contactPhone: null, sourceId: "canary-id", lastMessageAt: new Date("2026-10-21T10:00:00Z") } });
    await db.message.create({ data: { conversationId: "canary", body: "sealed:the canary token is here", direction: "inbound", timestamp: new Date("2026-10-21T10:00:00Z") } });
    await stepsUntilIdle(KEY_A);
    for (const query of ["canary", "token", "key-canary", "canary:v1", "the canary token"]) {
      const expected = await answer(searchConversationWindow, KEY_A, query, fresh());
      const actual = await answer(searchConversationIndex, KEY_A, query, fresh());
      expect(actual, `query ${query}`).toEqual(expected);
      expect(actual.filter((row) => row.id === "canary").length).toBeLessThanOrEqual(1);
    }
    expect((await answer(searchConversationIndex, KEY_A, "the canary token", fresh())).map((row) => row.id)).toEqual(["canary"]);
    expect(await canaryDocs()).toBe(1);
  });
});
