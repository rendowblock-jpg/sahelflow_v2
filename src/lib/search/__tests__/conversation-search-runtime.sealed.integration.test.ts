process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { db, dbRaw, shopContext } from "@/lib/db";
import { runConversationSearchIndexTick } from "@/lib/search/conversation-search-runtime";
import { hashTokenStrings, tokenStringsOf } from "@/lib/search/conversation-search-tokens";
import { compactSearchText, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD: the app wiring of the indexer on the REAL path. Rows are written through the app's own
 * `db` (the real protected-PII extension seals bodies and contacts with the shop key) and indexed by the real
 * `runConversationSearchIndexTick`. Synthetic data only.
 */

type ProtectedClient = Parameters<typeof deriveShopBlindIndexes>[0];
const WORD_LATIN = "quixotrel";
const WORD_ARABIC = "زنبركان";

/** The shop's blind-index key row. The real write path creates it on first use; a read never does. */
const ensureKey = (): Promise<string[]> =>
  deriveShopBlindIndexes(db as unknown as ProtectedClient, ["probe"], { recordType: "SearchProjection", field: "probe" }, {
    shopContext,
    normalize: (value) => value,
  });
const derive = (values: string[], reference: { recordType: string; field: string }) =>
  deriveShopBlindIndexes(db as unknown as ProtectedClient, values, reference as never, {
    shopContext,
    normalize: (value) => value,
  });

const raw = <T>(sql: string, ...args: unknown[]) => dbRaw.$queryRawUnsafe<T[]>(sql, ...args);
async function count(table: string, where = "1=1", ...args: unknown[]): Promise<number> {
  const [row] = await raw<{ n: bigint | number }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`, ...args);
  return Number(row?.n ?? 0);
}

async function wipe(): Promise<void> {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await dbRaw.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

let sequence = 0;
async function conversationWith(
  bodies: string[],
  contact: { name?: string | null; phone?: string | null } = {},
): Promise<{ id: string; messageIds: string[] }> {
  sequence += 1;
  const conversation = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: contact.name === undefined ? `Client ${sequence}` : contact.name,
      contactPhone: contact.phone === undefined ? `055500${String(sequence).padStart(4, "0")}` : contact.phone,
      sourceId: `runtime-test-${sequence}`,
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

/** Ticks until the indexer says "nothing changed". The cap is the test's own safety net. */
async function tickUntilIdle(): Promise<number> {
  for (let turns = 1; turns <= 200; turns += 1) {
    if (!(await runConversationSearchIndexTick()).changed) return turns;
  }
  throw new Error("the indexer did not become idle in 200 turns");
}

const hashesOf = async (kind: "M" | "C", entityId: string): Promise<string[]> =>
  (
    await raw<{ tokenHash: bigint }>(
      `SELECT t."tokenHash" AS tokenHash FROM "ConversationSearchToken" t JOIN "ConversationSearchDoc" d ON d."docId" = t."docId"
        WHERE d."kind" = ? AND d."entityId" = ? ORDER BY t."tokenHash"`,
      kind,
      entityId,
    )
  ).map((row) => String(row.tokenHash));

async function expectedHashes(text: string, conversationId: string): Promise<string[]> {
  const numbers = (await hashTokenStrings(tokenStringsOf(normalizeSearchText(text)), conversationId, derive))!;
  return [...new Set(numbers)].sort((a, b) => a - b).map(String);
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

describe("conversation-search wiring on the real sealed path", () => {
  it("indexes every message and conversation written through the app's db, and stores only hashes", async () => {
    const first = await conversationWith([
      `Bonjour ${WORD_LATIN} livraison à Alger`,
      `السلام عليكم ${WORD_ARABIC} واش كاين`,
      "ok merci",
    ]);
    const second = await conversationWith([`encore ${WORD_LATIN} svp`, `مرحبا ${WORD_ARABIC}`]);

    // the real extension sealed what was written
    const sealed = await raw<{ body: string }>(`SELECT "body" FROM "Message"`);
    expect(sealed).toHaveLength(5);
    for (const row of sealed) expect(row.body).not.toContain(WORD_LATIN);
    expect(await count("ConversationSearchDirty", `"kind" = 'M'`)).toBe(5);

    const turns = await tickUntilIdle();
    expect(turns).toBeLessThan(200);

    for (const message of [...first.messageIds, ...second.messageIds]) {
      expect(await count("ConversationSearchDoc", `"kind" = 'M' AND "entityId" = ?`, message)).toBe(1);
      expect((await hashesOf("M", message)).length).toBeGreaterThan(0);
    }
    for (const conversation of [first, second]) {
      expect(await count("ConversationSearchDoc", `"kind" = 'C' AND "entityId" = ?`, conversation.id)).toBe(1);
    }
    expect(await count("ConversationSearchDirty")).toBe(0);

    // the tokens are the hashes of the DECRYPTED text (a failed decrypt would give other hashes or none)
    expect(await hashesOf("M", first.messageIds[0]!)).toEqual(
      await expectedHashes(`Bonjour ${WORD_LATIN} livraison à Alger`, first.id),
    );
    expect(await hashesOf("M", first.messageIds[1]!)).toEqual(
      await expectedHashes(`السلام عليكم ${WORD_ARABIC} واش كاين`, first.id),
    );

    // nothing readable in the three index tables
    const dump = JSON.stringify(
      [
        ...(await raw(`SELECT * FROM "ConversationSearchDoc"`)),
        ...(await raw(`SELECT * FROM "ConversationSearchToken"`)),
        ...(await raw(`SELECT * FROM "ConversationSearchDirty"`)),
      ],
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ).toLowerCase();
    expect(dump).not.toContain(WORD_LATIN);
    expect(dump).not.toContain(WORD_ARABIC);
    expect(dump).not.toContain("livraison");
    expect(dump).not.toContain("bonjour");
    const columns = await raw<{ name: string }>(`SELECT name FROM pragma_table_info('ConversationSearchToken')`);
    expect(columns.map((column) => column.name).sort()).toEqual(["docId", "tokenHash"]);
  });

  it("gives the same word different hashes in two conversations (salt)", async () => {
    const first = await conversationWith([`${WORD_LATIN} ${WORD_ARABIC}`]);
    const second = await conversationWith([`${WORD_LATIN} ${WORD_ARABIC}`]);
    await tickUntilIdle();
    const a = await hashesOf("M", first.messageIds[0]!);
    const b = await hashesOf("M", second.messageIds[0]!);
    expect(a.length).toBeGreaterThan(10);
    expect(b).toHaveLength(a.length);
    expect(a.filter((hash) => b.includes(hash))).toEqual([]);
  });

  it("re-indexes a message edited with db.message.update", async () => {
    const conversation = await conversationWith(["avant la modification"]);
    await tickUntilIdle();
    const before = await hashesOf("M", conversation.messageIds[0]!);
    await db.message.update({ where: { id: conversation.messageIds[0]! }, data: { body: `après ${WORD_LATIN}` } });
    await tickUntilIdle();
    const after = await hashesOf("M", conversation.messageIds[0]!);
    expect(after).not.toEqual(before);
    expect(after).toEqual(await expectedHashes(`après ${WORD_LATIN}`, conversation.id));
    expect(await count("ConversationSearchDoc", `"kind" = 'M'`)).toBe(1);
  });

  it("removes the doc and the tokens of a deleted message", async () => {
    const conversation = await conversationWith(["un", "deux messages ici"]);
    await tickUntilIdle();
    expect(await count("ConversationSearchDoc", `"kind" = 'M'`)).toBe(2);
    await db.message.delete({ where: { id: conversation.messageIds[1]! } });
    await tickUntilIdle();
    expect(await count("ConversationSearchDoc", `"kind" = 'M' AND "entityId" = ?`, conversation.messageIds[1]!)).toBe(0);
    expect(await hashesOf("M", conversation.messageIds[1]!)).toEqual([]);
    expect(await count("ConversationSearchDoc", `"kind" = 'M'`)).toBe(1);
    expect(await count("ConversationSearchDirty")).toBe(0);
  });

  it("does nothing, and writes nothing, while the shop key row is missing", async () => {
    await conversationWith(["un message", "un autre message"]);
    // The app's db caches the key rows it loaded at start, so the row is removed under it, as a lost file would be.
    const keyRow = await dbRaw.protectedKeyAuthority.findUnique({ where: { purpose: "shop-blind-index" } });
    expect(keyRow).not.toBeNull();
    await dbRaw.protectedKeyAuthority.deleteMany({ where: { purpose: "shop-blind-index" } });
    try {
      const before = [
        await count("ConversationSearchDoc"),
        await count("ConversationSearchToken"),
        await count("ConversationSearchDirty"),
      ];
      expect(before[2]).toBe(3); // two messages and the conversation
      expect(await runConversationSearchIndexTick()).toEqual({ changed: false });
      expect([
        await count("ConversationSearchDoc"),
        await count("ConversationSearchToken"),
        await count("ConversationSearchDirty"),
      ]).toEqual(before);
    } finally {
      await dbRaw.protectedKeyAuthority.create({ data: keyRow! });
    }
    // with the row back, the same queue is indexed
    await tickUntilIdle();
    expect(await count("ConversationSearchDoc", `"kind" = 'M'`)).toBe(2);
    expect(await count("ConversationSearchDirty")).toBe(0);
  });
});

const contactStrings = (name: string | null, phone: string | null): string[] => [
  ...tokenStringsOf(normalizeSearchText(name ?? "")).map((entry) => `conv-n:${entry}`),
  ...tokenStringsOf(normalizeSearchText(phone ?? "")).map((entry) => `conv-p:${entry}`),
  ...tokenStringsOf(compactSearchText(name ?? "")).map((entry) => `conv-c:${entry}`),
  ...tokenStringsOf(compactSearchText(phone ?? "")).map((entry) => `conv-c:${entry}`),
];
async function hashedSorted(strings: string[], conversationId: string): Promise<string[]> {
  const numbers = (await hashTokenStrings(strings, conversationId, derive))!;
  return [...new Set(numbers)].sort((a, b) => a - b).map(String);
}

describe("contact tokens through the real sealed path", () => {
  it("indexes the decrypted contact; a rename removes the old name's tokens and adds the new name's", async () => {
    const OLD = "Zorbaxel Quillon";
    const NEW = "Mirvanth Delcora";
    const conversation = await conversationWith(["bonjour"], { name: OLD, phone: "0555 11 22 33" });
    const sealedContact = await raw<{ contactName: string; contactPhone: string }>(
      `SELECT "contactName", "contactPhone" FROM "Conversation" WHERE "id" = ?`,
      conversation.id,
    );
    expect(sealedContact[0]!.contactName).not.toContain("Zorbaxel");
    await tickUntilIdle();
    expect(await hashesOf("C", conversation.id)).toEqual(await hashedSorted(contactStrings(OLD, "0555 11 22 33"), conversation.id));

    await db.conversation.update({ where: { id: conversation.id }, data: { contactName: NEW } });
    await tickUntilIdle();
    const now = await hashesOf("C", conversation.id);
    expect(now).toEqual(await hashedSorted(contactStrings(NEW, "0555 11 22 33"), conversation.id));
    const oldOnly = (await hashedSorted(contactStrings(OLD, null), conversation.id)).filter((hash) => !now.includes(hash));
    expect(oldOnly.length).toBeGreaterThan(20);
    expect(await count("ConversationSearchDoc", `"kind" = 'C' AND "entityId" = ?`, conversation.id)).toBe(1);
    expect(await count("ConversationSearchDirty")).toBe(0);
  });

  it("finds 0555 12 34 56 through the compact tokens of +213555123456, and the other way round", async () => {
    const national = await conversationWith(["a"], { name: "Client A", phone: "0555 12 34 56" });
    const international = await conversationWith(["b"], { name: "Client B", phone: "+213555123456" });
    await tickUntilIdle();
    for (const conversation of [national, international]) {
      const compact = (await hashedSorted(tokenStringsOf(compactSearchText("0555 12 34 56")).map((entry) => `conv-c:${entry}`), conversation.id));
      const stored = await hashesOf("C", conversation.id);
      expect(compact.length).toBeGreaterThan(5);
      expect(compact.every((hash) => stored.includes(hash))).toBe(true);
      const other = await hashedSorted(tokenStringsOf(compactSearchText("+213555123456")).map((entry) => `conv-c:${entry}`), conversation.id);
      expect(other).toEqual(compact);
    }
  });

  it("indexes a contact without a phone", async () => {
    const conversation = await conversationWith([], { name: "Karim Seul", phone: null });
    await tickUntilIdle();
    expect(await hashesOf("C", conversation.id)).toEqual(await hashedSorted(contactStrings("Karim Seul", null), conversation.id));
  });
});
