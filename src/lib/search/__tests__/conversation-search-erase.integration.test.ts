process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { db, dbRaw, shopContext } from "@/lib/db";
import { executeShopErase } from "@/lib/privacy/lifecycle";
import { runConversationSearchIndexTick, searchConversationsIndexed } from "@/lib/search/conversation-search-runtime";
import { hashTokenStrings, tokenStringsOf } from "@/lib/search/conversation-search-tokens";
import { normalizeSearchText } from "@/lib/search/universal-search";
import { deleteWhatsAppChats } from "@/lib/whatsapp/chat-delete";

/**
 * PB-CONV-SEARCH-LOAD, T5: erasing a shop or deleting a conversation leaves no trace in the search index. Rows are
 * written through the app's own `db` (sealed bodies and contacts), indexed by the real tick, deleted by the real
 * code (`executeShopErase`, `deleteWhatsAppChats`). Synthetic data only.
 */

// The test sandbox has no shop-registry file, so the one live-authority check in front of the erase transaction is
// stubbed. The erase itself (executeShopErase, withPrivacyEraseTransaction, dbRaw.$transaction) is the real code.
vi.mock("@/lib/shops/authority", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shops/authority")>()),
  assertProcessShopAuthority: () => undefined,
}));

type ProtectedClient = Parameters<typeof deriveShopBlindIndexes>[0];
const WORD_ONLY_HERE = "quixotrel";
const WORD_ARABIC_ONLY_HERE = "زنبركان";
const WORD_STAYS = "mandarinier";
const INDEX_TABLES = ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"] as const;

const derive = (values: string[], reference: { recordType: string; field: string }) =>
  deriveShopBlindIndexes(db as unknown as ProtectedClient, values, reference as never, {
    shopContext,
    normalize: (value) => value,
  });
/** The shop's blind-index key row; the real write path creates it on first use. */
const ensureKey = (): Promise<string[]> => derive(["probe"], { recordType: "SearchProjection", field: "probe" });

const raw = <T>(sql: string, ...args: unknown[]) => dbRaw.$queryRawUnsafe<T[]>(sql, ...args);
async function count(table: string, where = "1=1", ...args: unknown[]): Promise<number> {
  const [row] = await raw<{ n: bigint | number }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`, ...args);
  return Number(row?.n ?? 0);
}
async function wipe(): Promise<void> {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  for (const table of INDEX_TABLES) await dbRaw.$executeRawUnsafe(`DELETE FROM "${table}"`);
}

let sequence = 0;
async function conversationWith(bodies: string[]): Promise<{ id: string; messageIds: string[] }> {
  sequence += 1;
  const conversation = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: `Client ${sequence}`,
      contactPhone: `055500${String(sequence).padStart(4, "0")}`,
      sourceId: `erase-test-${sequence}`,
      lastMessageAt: new Date(Date.parse("2026-10-20T10:00:00Z") + sequence * 1000),
    },
  });
  const messageIds: string[] = [];
  for (const [index, body] of bodies.entries()) {
    const message = await db.message.create({
      data: {
        conversationId: conversation.id,
        body,
        direction: index % 2 === 0 ? "inbound" : "outbound",
        timestamp: new Date(Date.parse("2026-10-01T08:00:00Z") + index * 60_000),
      },
    });
    messageIds.push(message.id);
  }
  return { id: conversation.id, messageIds };
}

async function tickUntilIdle(cap = 200): Promise<number> {
  for (let turns = 1; turns <= cap; turns += 1) {
    if (!(await runConversationSearchIndexTick()).changed) return turns;
  }
  throw new Error(`the indexer did not become idle in ${cap} turns`);
}

/** The salted numbers the index stores for these words in this conversation, under the test shop key. */
async function hashesOfWords(text: string, conversationId: string): Promise<bigint[]> {
  const numbers = await hashTokenStrings(tokenStringsOf(normalizeSearchText(text)), conversationId, derive);
  if (numbers === null) throw new Error("the shop key row is missing");
  return [...new Set(numbers)].map((value) => BigInt(value));
}
async function storedAmong(hashes: readonly bigint[]): Promise<number> {
  if (hashes.length === 0) return 0;
  const marks = hashes.map(() => "?").join(",");
  return count("ConversationSearchToken", `"tokenHash" IN (${marks})`, ...hashes);
}
async function allHashesOfConversation(conversationId: string): Promise<bigint[]> {
  return (
    await raw<{ tokenHash: bigint }>(
      `SELECT t."tokenHash" AS tokenHash FROM "ConversationSearchToken" t JOIN "ConversationSearchDoc" d ON d."docId" = t."docId"
        WHERE d."conversationId" = ?`,
      conversationId,
    )
  ).map((row) => BigInt(row.tokenHash));
}
const idsOf = async (query: string) => (await searchConversationsIndexed({ query, canReadContact: true })).map((row) => row.id);

const chatContext = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("conv-search-erase-test-session"),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
/** deleteWhatsAppChats removes media files below SF_DATA_DIR; point it at a scratch folder for that call only. */
async function deleteChats(ids: string[]): Promise<{ deletedMessageCount: number }> {
  const scratch = mkdtempSync(join(tmpdir(), "sahelflow-conv-search-erase-"));
  const before = process.env.SF_DATA_DIR;
  process.env.SF_DATA_DIR = scratch;
  try {
    return await deleteWhatsAppChats(chatContext, ids);
  } finally {
    if (before === undefined) delete process.env.SF_DATA_DIR;
    else process.env.SF_DATA_DIR = before;
    rmSync(scratch, { recursive: true, force: true });
  }
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

describe("conversation-search index versus erase and delete (T5)", () => {
  it("(a) executeShopErase leaves no index row and no Message or Conversation; the State row keeps its scheme", async () => {
    await conversationWith([`Bonjour ${WORD_ONLY_HERE} livraison`, `السلام عليكم ${WORD_ARABIC_ONLY_HERE}`]);
    await conversationWith([`encore ${WORD_ONLY_HERE} svp`, "ok merci"]);
    await tickUntilIdle();
    // one more write after the drain: the queue holds rows at the moment of the erase
    await conversationWith([`tard ${WORD_STAYS}`]);
    expect(await count("ConversationSearchDoc")).toBeGreaterThan(0);
    expect(await count("ConversationSearchToken")).toBeGreaterThan(0);
    expect(await count("ConversationSearchDirty")).toBeGreaterThan(0);
    const [stateBefore] = await raw<{ scheme: number | bigint }>(`SELECT "scheme" FROM "ConversationSearchState"`);

    await executeShopErase("privacy-erase");

    for (const table of INDEX_TABLES) expect(await count(table)).toBe(0);
    expect(await count("Message")).toBe(0);
    expect(await count("Conversation")).toBe(0);
    const states = await raw<{ id: string; scheme: number | bigint }>(`SELECT "id", "scheme" FROM "ConversationSearchState"`);
    expect(states).toHaveLength(1);
    expect(Number(states[0]?.scheme)).toBe(Number(stateBefore?.scheme));
    expect(await idsOf(WORD_ONLY_HERE)).toEqual([]);
  });

  it("(b) deleting one conversation the way the app does leaves no doc, token, queue row or searchable word of it", async () => {
    const doomed = await conversationWith([
      `Bonjour ${WORD_ONLY_HERE} livraison ${WORD_STAYS}`,
      `السلام عليكم ${WORD_ARABIC_ONLY_HERE}`,
      "ok merci",
    ]);
    const kept = await conversationWith([`livraison ${WORD_STAYS} svp`, "merci beaucoup"]);
    await tickUntilIdle();
    // one queued message of the doomed chat at the moment of the delete
    const late = await db.message.create({
      data: { conversationId: doomed.id, body: "dernier message", direction: "inbound", timestamp: new Date("2026-10-02T08:00:00Z") },
    });

    const wordHashes = [
      ...(await hashesOfWords(WORD_ONLY_HERE, doomed.id)),
      ...(await hashesOfWords(WORD_ARABIC_ONLY_HERE, doomed.id)),
    ];
    const everyHashBefore = await allHashesOfConversation(doomed.id);
    // the proof is only worth something if the index held them before
    expect(wordHashes.length).toBeGreaterThan(0);
    expect(await storedAmong(wordHashes)).toBe(wordHashes.length);
    expect(everyHashBefore.length).toBeGreaterThan(wordHashes.length);
    expect(await count("ConversationSearchDirty", `"entityId" = ?`, late.id)).toBe(1);
    expect(await idsOf(WORD_ONLY_HERE)).toEqual([doomed.id]);
    expect(await idsOf(WORD_ARABIC_ONLY_HERE)).toEqual([doomed.id]);
    const keptHashesBefore = await allHashesOfConversation(kept.id);

    const result = await deleteChats([doomed.id]);
    expect(result.deletedMessageCount).toBe(4);

    // the delete triggers run in the delete's own transaction: no drain is needed for these to hold
    const verify = async () => {
      expect(await count("ConversationSearchDoc", `"conversationId" = ?`, doomed.id)).toBe(0);
      expect(await count("ConversationSearchDirty", `"conversationId" = ?`, doomed.id)).toBe(0);
      expect(await count("Message", `"conversationId" = ?`, doomed.id)).toBe(0);
      expect(await storedAmong(wordHashes)).toBe(0);
      expect(await storedAmong(everyHashBefore)).toBe(0);
      expect(await idsOf(WORD_ONLY_HERE)).toEqual([]);
      expect(await idsOf(WORD_ARABIC_ONLY_HERE)).toEqual([]);
      // the neighbour is untouched
      expect(await allHashesOfConversation(kept.id)).toEqual(keptHashesBefore);
      expect(await idsOf(WORD_STAYS)).toEqual([kept.id]);
    };
    await verify();
    await tickUntilIdle();
    await verify();
    expect(await count("ConversationSearchDirty")).toBe(0);
  });

  it("(c) a body changed to [removed] loses the tokens of its old words and the old word is no longer found", async () => {
    const conversation = await conversationWith([`avant ${WORD_ONLY_HERE} promo`, "autre message neutre"]);
    await tickUntilIdle();
    // Hashes are salted per conversation, so a trigram that two messages of the SAME conversation share (here "tre" of
    // quixotrel and of "autre") legitimately stays while the other message lives: only the hashes that nothing else holds
    // must vanish.
    const stillHeld = new Set((await hashesOfWords("autre message neutre", conversation.id)).map(String));
    const oldHashes = (await hashesOfWords(`${WORD_ONLY_HERE} promo`, conversation.id)).filter((hash) => !stillHeld.has(String(hash)));
    expect(oldHashes.length).toBeGreaterThan(5);
    // punctuation stays inside the word, so the stored tokens of "[removed]" are not those of "removed" (own word start)
    const removedHashes = await hashesOfWords("[removed]", conversation.id);
    expect(await storedAmong(oldHashes)).toBe(oldHashes.length);
    expect(await storedAmong(removedHashes)).toBe(0);
    expect(await idsOf(WORD_ONLY_HERE)).toEqual([conversation.id]);

    await db.message.update({ where: { id: conversation.messageIds[0]! }, data: { body: "[removed]" } });
    // the update trigger already took the old tokens away, before any drain
    expect(await storedAmong(oldHashes)).toBe(0);
    expect(await idsOf(WORD_ONLY_HERE)).toEqual([]);

    await tickUntilIdle();
    expect(await storedAmong(oldHashes)).toBe(0);
    expect(await storedAmong(removedHashes)).toBe(removedHashes.length);
    expect(await idsOf(WORD_ONLY_HERE)).toEqual([]);
    expect(await idsOf("promo")).toEqual([]);
    expect(await idsOf("removed")).toEqual([conversation.id]);
    expect(await count("ConversationSearchDirty")).toBe(0);
  });

  it("(d) erases a 5,000-message indexed shop in bounded time", { timeout: 600_000 }, async () => {
    const conversations = 125;
    const perConversation = 40;
    for (let index = 0; index < conversations; index += 1) {
      await conversationWith(
        Array.from({ length: perConversation }, (_, at) => `message ${index} numero ${at} livraison ${at % 7 === 0 ? WORD_STAYS : "merci"}`),
      );
    }
    const turns = await tickUntilIdle(5_000);
    const messages = conversations * perConversation;
    expect(await count("Message")).toBe(messages);
    expect(await count("ConversationSearchDoc", `"kind" = 'M'`)).toBe(messages);
    const tokensBefore = await count("ConversationSearchToken");
    expect(tokensBefore).toBeGreaterThan(messages);

    const started = performance.now();
    await executeShopErase("privacy-erase");
    const elapsedMs = Math.round(performance.now() - started);
    // A test must not write outside the repository (CI checks the repository out alone: the old note file under
    // ../audit/tmp made this test fail with ENOENT on Modal). The number travels in the assertion message instead.
    // generous: the privacy-erase transaction itself is allowed 60 s
    expect(elapsedMs, `erase of ${messages} indexed messages (${tokensBefore} tokens, ${turns} ticks to index)`).toBeLessThan(30_000);
    for (const table of INDEX_TABLES) expect(await count(table)).toBe(0);
    expect(await count("Message")).toBe(0);
    expect(await count("Conversation")).toBe(0);
    expect(await count("ConversationSearchState")).toBe(1);
  });

  it("(d) the delete order wipes the index tables before the messages and the conversations (source contract)", () => {
    const source = readFileSync(resolve(process.env.SF_REPO_DIR ?? process.cwd(), "src/lib/privacy/lifecycle.ts"), "utf8");
    const start = source.indexOf("export async function executeShopErase");
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start);
    const at = (needle: string) => {
      const found = body.indexOf(needle);
      expect(found, `${needle} is missing from executeShopErase`).toBeGreaterThan(-1);
      return found;
    };
    const wipes = ["tx.conversationSearchToken.deleteMany({})", "tx.conversationSearchDoc.deleteMany({})", "tx.conversationSearchDirty.deleteMany({})"].map(at);
    const messages = at("tx.message.deleteMany({})");
    const conversations = at("tx.conversation.deleteMany({})");
    for (const position of wipes) expect(position).toBeLessThan(messages);
    expect(messages).toBeLessThan(conversations);
    // the State row (scheme, completedAt) is kept, like the search revision watermark
    expect(body).not.toContain("conversationSearchState.deleteMany");
    expect(body).not.toContain('DELETE FROM "ConversationSearchState"');
  });
});
