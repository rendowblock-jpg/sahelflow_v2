import { createHmac } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestPrisma, disconnectTestPrisma } from "@/lib/data/__tests__/helpers";
import {
  backfillConversationSearchChunk,
  drainConversationSearchDirty,
  isBusyError,
  runConversationSearchIndexStep,
  type IndexerClient,
  type IndexerPorts,
  type SealedContact,
  type SealedMessage,
  type SqlClient,
} from "@/lib/search/conversation-search-index";
import {
  hashTokenStrings,
  tokenStringsOf,
  type BlindIndexDeriver,
} from "@/lib/search/conversation-search-tokens";
import { compactSearchText, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD, slice 3: the indexer (drain of the Dirty queue, backfill of old conversations, races).
 * Real SQLite test database and the real migration. Messages are "sealed" with a fake prefix so the tests can
 * change the stored ciphertext; the key is a fixed test key (or none).
 */

const KEY = Buffer.from("conversation-search-test-key-0001");
const derive: BlindIndexDeriver = async (values) =>
  values.map((value) => createHmac("sha256", KEY).update(value).digest("hex"));
const noKey: BlindIndexDeriver = async () => null;
const seal = (text: string) => `sealed:${text}`;
const openBody = async (message: SealedMessage) => {
  if (!message.body.startsWith("sealed:")) throw new Error("not sealed");
  return message.body.slice("sealed:".length);
};

// The test database holds contacts unsealed, so "opening" them is the identity.
const openContact = async (contact: SealedContact) => ({ name: contact.contactName, phone: contact.contactPhone });

let db: PrismaClient;
let sequence = 0;
const ports = (extra: Partial<IndexerPorts> = {}): IndexerPorts => ({
  client: db as unknown as IndexerClient,
  derive,
  openBody,
  openContact,
  ...extra,
});

async function rows<T>(sql: string, ...args: unknown[]): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(sql, ...args);
}
async function count(table: string, where = "1=1", ...args: unknown[]): Promise<number> {
  const result = await rows<{ n: bigint | number }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`, ...args);
  return Number(result[0]?.n ?? 0);
}
async function wipeIndex(): Promise<void> {
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}
/** Old data: messages and conversations that exist but were never queued (they predate the migration). */
async function forgetQueue(): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchDirty"`);
}

const SAMPLES = [
  "السلام عليكم، واش كاين التوصيل لوهران؟",
  "بغيت نطلب الحذاء مقاس 42 من فضلك",
  "Bonjour, je veux commander la robe rouge, livraison à Alger ?",
  "salam khouya, wach kayen livraison l Oran? 3andek taille 42 ?",
  "ch7al el prix? nkhalas 3and l'istilam",
  "ok",
];

async function shop(
  spec: Array<{ messages: number; lastMessageAt: string; name?: string; phone?: string | null }>,
): Promise<{ conversationIds: string[] }> {
  const conversationIds: string[] = [];
  for (const entry of spec) {
    sequence += 1;
    const conversation = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: entry.name ?? `Client ${sequence}`,
        contactPhone: entry.phone === undefined ? `055500${String(sequence).padStart(4, "0")}` : entry.phone,
        sourceId: `indexer-test-${sequence}`,
        lastMessageAt: new Date(entry.lastMessageAt),
      },
    });
    conversationIds.push(conversation.id);
    await db.message.createMany({
      data: Array.from({ length: entry.messages }, (_, index) => ({
        conversationId: conversation.id,
        body: seal(`${SAMPLES[(index + sequence) % SAMPLES.length]} #${index}`),
        direction: index % 2 === 0 ? "inbound" : "outbound",
        timestamp: new Date(Date.parse("2026-10-01T08:00:00Z") + index * 60_000),
      })),
    });
  }
  return { conversationIds };
}

async function snapshot() {
  const docs = await rows<{ kind: string; entityId: string; conversationId: string }>(
    `SELECT "kind","entityId","conversationId" FROM "ConversationSearchDoc" ORDER BY "kind","entityId"`,
  );
  const tokens = await rows<{ kind: string; entityId: string; tokenHash: bigint }>(
    `SELECT d."kind" AS kind, d."entityId" AS entityId, t."tokenHash" AS tokenHash
       FROM "ConversationSearchToken" t JOIN "ConversationSearchDoc" d ON d."docId" = t."docId"
      ORDER BY d."kind", d."entityId", t."tokenHash"`,
  );
  return { docs, tokens: tokens.map((token) => `${token.kind}|${token.entityId}|${String(token.tokenHash)}`) };
}

async function backfillAll(extra: Partial<IndexerPorts> = {}, maxChunks = 100): Promise<number> {
  let chunks = 0;
  for (; chunks < maxChunks; chunks += 1) {
    const result = await backfillConversationSearchChunk(ports(extra));
    if ("skipped" in result || result.indexed + result.covered === 0) break;
  }
  return chunks;
}

const docOf = (kind: string, entityId: string) =>
  rows<{ docId: number | bigint }>(`SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind"=? AND "entityId"=?`, kind, entityId);
const tokensOfDoc = async (kind: string, entityId: string): Promise<string[]> =>
  (
    await rows<{ tokenHash: bigint }>(
      `SELECT t."tokenHash" AS tokenHash FROM "ConversationSearchToken" t JOIN "ConversationSearchDoc" d ON d."docId"=t."docId"
        WHERE d."kind"=? AND d."entityId"=? ORDER BY t."tokenHash"`,
      kind,
      entityId,
    )
  ).map((row) => String(row.tokenHash));
async function expectedTokens(text: string, conversationId: string): Promise<string[]> {
  const numbers = (await hashTokenStrings(tokenStringsOf(normalizeSearchText(text)), conversationId, derive))!;
  return [...new Set(numbers)].sort((a, b) => a - b).map(String);
}

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

describe("T4: backfill is resumable", () => {
  it("an interrupted-then-resumed backfill ends with the same doc and token rows as an uninterrupted one", async () => {
    await shop([
      { messages: 250, lastMessageAt: "2026-10-20T10:00:00Z" },
      { messages: 5, lastMessageAt: "2026-10-22T10:00:00Z" },
      { messages: 0, lastMessageAt: "2026-10-21T10:00:00Z" },
      { messages: 101, lastMessageAt: "2026-10-19T10:00:00Z" },
    ]);
    await forgetQueue();

    const chunks = await backfillAll();
    const full = await snapshot();
    expect(chunks).toBe(1 + 3 + 1 + 2); // 5 msgs; 0 msgs; 250 msgs in 3; 101 msgs in 2
    expect(full.docs.filter((doc) => doc.kind === "C")).toHaveLength(4);
    expect(full.docs.filter((doc) => doc.kind === "M")).toHaveLength(356);
    expect(full.tokens.length).toBeGreaterThan(356);

    for (const stopAfter of [1, 3, 5]) {
      await wipeIndex();
      for (let done = 0; done < stopAfter; done += 1) await backfillConversationSearchChunk(ports());
      const before = await snapshot();
      // the process dies inside the next chunk: its transaction never starts
      await expect(
        backfillConversationSearchChunk(
          ports({
            beforeWrite: async () => {
              throw new Error("killed");
            },
          }),
        ),
      ).rejects.toThrow("killed");
      expect(await snapshot()).toEqual(before);
      await backfillAll();
      expect(await snapshot()).toEqual(full);
    }
  });

  it("works on the newest conversation first", async () => {
    const { conversationIds } = await shop([
      { messages: 3, lastMessageAt: "2026-10-01T10:00:00Z" },
      { messages: 3, lastMessageAt: "2026-10-24T10:00:00Z" },
    ]);
    await forgetQueue();
    await backfillConversationSearchChunk(ports());
    expect(await docOf("C", conversationIds[1]!)).toHaveLength(1);
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(0);
  });

  it("a conversation with no message gets its C doc and nothing else", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    const result = await backfillConversationSearchChunk(ports());
    expect(result).toMatchObject({ indexed: 0, covered: 1, remaining: 0 });
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(1);
    expect(await count("ConversationSearchDoc", `"kind"='M'`)).toBe(0);
    // the only tokens are the contact's, on the C doc
    expect(await count("ConversationSearchToken")).toBe((await tokensOfDoc("C", conversationIds[0]!)).length);
    expect(await count("ConversationSearchToken")).toBeGreaterThan(0);
  });

  it("messages that are still queued are left to the drain, and the conversation is still marked", async () => {
    const { conversationIds } = await shop([{ messages: 4, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    // the queue was NOT forgotten: every message is Dirty, so nothing is read by the backfill
    const result = await backfillConversationSearchChunk(ports());
    expect(result).toMatchObject({ indexed: 0, covered: 1 });
    expect(await count("ConversationSearchDoc", `"kind"='M'`)).toBe(0);
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(1);
    expect(await count("ConversationSearchDirty", `"kind"='M'`)).toBe(4);
  });
});

describe("tokens stored", () => {
  it("are the salted hashes of the folded text: exactly what the query side will compute", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const message = await db.message.create({
      data: { conversationId: conversationIds[0]!, body: seal("Livraison à Alger"), direction: "inbound", timestamp: new Date() },
    });
    const result = await drainConversationSearchDirty(ports());
    expect(result).toMatchObject({ indexed: 1, cleared: 1, remaining: 0 });
    expect(await tokensOfDoc("M", message.id)).toEqual(await expectedTokens("Livraison à Alger", conversationIds[0]!));
  });

  it("are salted per conversation: the same words give other numbers in another conversation", async () => {
    const { conversationIds } = await shop([
      { messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" },
      { messages: 0, lastMessageAt: "2026-10-21T10:00:00Z" },
    ]);
    const text = seal("wach kayen livraison l Oran");
    const [a, b] = await Promise.all(
      conversationIds.map((conversationId) =>
        db.message.create({ data: { conversationId, body: text, direction: "inbound", timestamp: new Date() } }),
      ),
    );
    await drainConversationSearchDirty(ports());
    const first = await tokensOfDoc("M", a!.id);
    const second = await tokensOfDoc("M", b!.id);
    expect(first.length).toBeGreaterThan(10);
    expect(second).toHaveLength(first.length);
    expect(first.filter((hash) => second.includes(hash))).toEqual([]);
  });

  it("hold no plaintext: no word of the messages appears in any index row", async () => {
    await shop([{ messages: 12, lastMessageAt: "2026-10-20T10:00:00Z", name: "Karima Benali" }]);
    await drainConversationSearchDirty(ports({}), 100);
    await forgetQueue();
    await backfillAll();
    const everything = JSON.stringify({
      docs: await rows(`SELECT * FROM "ConversationSearchDoc"`, ),
      tokens: (await rows<{ docId: number; tokenHash: bigint }>(`SELECT * FROM "ConversationSearchToken"`)).map(
        (row) => `${row.docId}:${String(row.tokenHash)}`,
      ),
      dirty: await rows(`SELECT * FROM "ConversationSearchDirty"`),
      state: await rows(`SELECT * FROM "ConversationSearchState"`),
    }).toLowerCase();
    expect(await count("ConversationSearchToken")).toBeGreaterThan(100);
    for (const word of ["livraison", "salam", "khouya", "commander", "alger", "oran", "التوصيل", "الحذاء", "karima", "benali", "sealed"]) {
      expect(everything).not.toContain(word.toLowerCase());
    }
  });
});

describe("drain", () => {
  it("indexes a new message, removes its Dirty row and replaces the doc when the body changes", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const message = await db.message.create({
      data: { conversationId: conversationIds[0]!, body: seal("prix du manteau"), direction: "inbound", timestamp: new Date() },
    });
    await drainConversationSearchDirty(ports());
    expect(await count("ConversationSearchDirty", `"kind"='M'`)).toBe(0);
    const first = await tokensOfDoc("M", message.id);
    expect(first).toEqual(await expectedTokens("prix du manteau", conversationIds[0]!));

    await db.message.update({ where: { id: message.id }, data: { body: seal("taille 42 disponible") } });
    expect(await docOf("M", message.id)).toHaveLength(0); // the trigger dropped it
    await drainConversationSearchDirty(ports());
    expect(await tokensOfDoc("M", message.id)).toEqual(await expectedTokens("taille 42 disponible", conversationIds[0]!));
  });

  it("leaves the Dirty row when the ciphertext changed after it was read, and indexes the new text next round", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const message = await db.message.create({
      data: { conversationId: conversationIds[0]!, body: seal("ancien texte"), direction: "inbound", timestamp: new Date() },
    });
    await forgetQueue();
    await db.$executeRawUnsafe(
      `INSERT INTO "ConversationSearchDirty" ("kind","entityId","conversationId") VALUES ('M', ?, ?)`,
      message.id,
      conversationIds[0]!,
    );
    const result = await drainConversationSearchDirty(
      ports({
        beforeWrite: async () => {
          await db.message.update({ where: { id: message.id }, data: { body: seal("nouveau texte") } });
        },
      }),
    );
    expect(result).toMatchObject({ indexed: 0, stale: 1 });
    expect(await docOf("M", message.id)).toHaveLength(0);
    expect(await count("ConversationSearchDirty", `"kind"='M' AND "entityId"=?`, message.id)).toBe(1);

    await drainConversationSearchDirty(ports());
    expect(await tokensOfDoc("M", message.id)).toEqual(await expectedTokens("nouveau texte", conversationIds[0]!));
    expect(await count("ConversationSearchDirty", `"kind"='M'`)).toBe(0);
  });

  it("a message deleted between the read and the write leaves no doc, no tokens and no Dirty row", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const [keep, doomed] = await Promise.all(
      ["je garde", "je pars"].map((text) =>
        db.message.create({
          data: { conversationId: conversationIds[0]!, body: seal(text), direction: "inbound", timestamp: new Date() },
        }),
      ),
    );
    await drainConversationSearchDirty(
      ports({
        beforeWrite: async () => {
          await db.message.delete({ where: { id: doomed!.id } });
        },
      }),
    );
    expect(await docOf("M", doomed!.id)).toHaveLength(0);
    expect(await count("ConversationSearchDirty", `"entityId"=?`, doomed!.id)).toBe(0);
    expect(await docOf("M", keep!.id)).toHaveLength(1);
    expect(await count("ConversationSearchToken", `"docId" NOT IN (SELECT "docId" FROM "ConversationSearchDoc")`)).toBe(0);
  });

  it("removes the doc and tokens of a message that is gone even if a stray queue row names it", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await db.$executeRawUnsafe(
      `INSERT INTO "ConversationSearchDoc" ("kind","entityId","conversationId") VALUES ('M','ghost',?)`,
      conversationIds[0]!,
    );
    const [ghost] = await docOf("M", "ghost");
    await db.$executeRawUnsafe(`INSERT INTO "ConversationSearchToken" ("docId","tokenHash") VALUES (?, 12345)`, Number(ghost!.docId));
    await db.$executeRawUnsafe(
      `INSERT INTO "ConversationSearchDirty" ("kind","entityId","conversationId") VALUES ('M','ghost',?)`,
      conversationIds[0]!,
    );
    await drainConversationSearchDirty(ports());
    expect(await docOf("M", "ghost")).toHaveLength(0);
    expect(await count("ConversationSearchToken", `"tokenHash"=12345`)).toBe(0);
    expect(await count("ConversationSearchDirty", `"entityId"='ghost'`)).toBe(0);
  });

  it("gives a conversation without messages its C doc at once and clears its queue row", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    expect(await count("ConversationSearchDirty", `"kind"='C'`)).toBe(1);
    expect(await drainConversationSearchDirty(ports())).toMatchObject({ covered: 1, cleared: 1 });
    expect(await count("ConversationSearchDirty", `"kind"='C'`)).toBe(0);
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(1);
  });

  it("a message that cannot be opened keeps its Dirty row, moves to the back, and does not block the others", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const bad = await db.message.create({
      data: { conversationId: conversationIds[0]!, body: "corrupt", direction: "inbound", timestamp: new Date() },
    });
    const good = await db.message.create({
      data: { conversationId: conversationIds[0]!, body: seal("bon message"), direction: "inbound", timestamp: new Date() },
    });
    const result = await drainConversationSearchDirty(ports());
    expect(result).toMatchObject({ indexed: 1, failed: 1 });
    expect(await docOf("M", good.id)).toHaveLength(1);
    expect(await docOf("M", bad.id)).toHaveLength(0);
    expect(await count("ConversationSearchDirty", `"entityId"=?`, bad.id)).toBe(1);
  });
});

describe("T6: races", () => {
  it("backfill does not overwrite a fresher doc that the drain wrote after the backfill chose its messages", async () => {
    const { conversationIds } = await shop([{ messages: 3, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    const [target] = await rows<{ id: string }>(`SELECT "id" FROM "Message" ORDER BY "timestamp" LIMIT 1`);
    const sentinel = 777_000_111;
    await backfillConversationSearchChunk(
      ports({
        beforeWrite: async () => {
          // what a drain does in the gap: a doc for this message with its own token rows
          await db.$executeRawUnsafe(
            `INSERT INTO "ConversationSearchDoc" ("kind","entityId","conversationId") VALUES ('M', ?, ?)`,
            target!.id,
            conversationIds[0]!,
          );
          const [doc] = await docOf("M", target!.id);
          await db.$executeRawUnsafe(`INSERT INTO "ConversationSearchToken" ("docId","tokenHash") VALUES (?, ?)`, Number(doc!.docId), sentinel);
        },
      }),
    );
    expect(await tokensOfDoc("M", target!.id)).toEqual([String(sentinel)]);
    expect(await count("ConversationSearchDoc", `"kind"='M'`)).toBe(3);
  });

  it("backfill skips a message whose body changed after it was read (the new text is the drain's job)", async () => {
    await shop([{ messages: 2, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    const [target] = await rows<{ id: string }>(`SELECT "id" FROM "Message" ORDER BY "timestamp" LIMIT 1`);
    await backfillConversationSearchChunk(
      ports({ beforeWrite: async () => void (await db.message.update({ where: { id: target!.id }, data: { body: seal("texte frais") } })) }),
    );
    expect(await docOf("M", target!.id)).toHaveLength(0);
    expect(await count("ConversationSearchDirty", `"entityId"=?`, target!.id)).toBe(1);
    await drainConversationSearchDirty(ports());
    const [conversation] = await rows<{ conversationId: string }>(`SELECT "conversationId" FROM "Message" WHERE "id"=?`, target!.id);
    expect(await tokensOfDoc("M", target!.id)).toEqual(await expectedTokens("texte frais", conversation!.conversationId));
  });

  it("does not write the C doc while a message has neither an M doc nor a Dirty row", async () => {
    const { conversationIds } = await shop([{ messages: 2, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    let strayId = "";
    const first = await backfillConversationSearchChunk(
      ports({
        beforeWrite: async () => {
          const stray = await db.message.create({
            data: { conversationId: conversationIds[0]!, body: seal("arrivé trop tard"), direction: "inbound", timestamp: new Date() },
          });
          strayId = stray.id;
          await forgetQueue(); // the gap: no doc, and no queue row either
        },
      }),
    );
    expect(first).toMatchObject({ indexed: 2, covered: 0 });
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(0);

    const second = await backfillConversationSearchChunk(ports());
    expect(second).toMatchObject({ indexed: 1, covered: 1 });
    expect(await docOf("M", strayId)).toHaveLength(1);
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(1);
  });

  it("does not write a C doc for a conversation deleted after the backfill chose it", async () => {
    const { conversationIds } = await shop([{ messages: 2, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    await backfillConversationSearchChunk(
      ports({ beforeWrite: async () => void (await db.conversation.delete({ where: { id: conversationIds[0]! } })) }),
    );
    expect(await count("ConversationSearchDoc")).toBe(0);
    expect(await count("ConversationSearchToken")).toBe(0);
  });
});

describe("no key", () => {
  it("does nothing and throws nothing when the blind-index key row is missing", async () => {
    await shop([{ messages: 3, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const queued = await count("ConversationSearchDirty");
    expect(queued).toBeGreaterThan(0);
    expect(await drainConversationSearchDirty(ports({ derive: noKey }))).toEqual({ skipped: "no-key" });
    expect(await backfillConversationSearchChunk(ports({ derive: noKey }))).toEqual({ skipped: "no-key" });
    expect(await runConversationSearchIndexStep(ports({ derive: noKey }))).toEqual({ skipped: "no-key" });
    expect(await count("ConversationSearchDoc")).toBe(0);
    expect(await count("ConversationSearchToken")).toBe(0);
    expect(await count("ConversationSearchDirty")).toBe(queued);
  });
});

describe("busy database", () => {
  const busy = () => Object.assign(new Error("Socket timeout: database is locked"), { code: "P1008" });
  function flaky(failures: number): { client: IndexerClient; calls: () => number } {
    let calls = 0;
    const client = {
      $queryRawUnsafe: db.$queryRawUnsafe.bind(db),
      $executeRawUnsafe: db.$executeRawUnsafe.bind(db),
      $transaction: (async (fn: never, options: never) => {
        calls += 1;
        if (calls <= failures) throw busy();
        return (db.$transaction as (f: never, o: never) => Promise<unknown>)(fn, options);
      }) as unknown as IndexerClient["$transaction"],
    } as IndexerClient;
    return { client, calls: () => calls };
  }

  it("recognises a busy error", () => {
    expect(isBusyError(busy())).toBe(true);
    expect(isBusyError(new Error("SQLITE_BUSY"))).toBe(true);
    expect(isBusyError(new Error("boom"))).toBe(false);
  });

  it("retries a busy write transaction up to 3 times", async () => {
    await shop([{ messages: 2, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    const twice = flaky(2);
    await backfillConversationSearchChunk(ports({ client: twice.client }));
    expect(twice.calls()).toBe(3);
    expect(await count("ConversationSearchDoc", `"kind"='C'`)).toBe(1);

    await wipeIndex();
    const always = flaky(99);
    await expect(backfillConversationSearchChunk(ports({ client: always.client }))).rejects.toMatchObject({ code: "P1008" });
    expect(always.calls()).toBe(3);
    expect(await count("ConversationSearchDoc")).toBe(0);
  });
});

describe("one step", () => {
  it("drains first, then backfills, and reports when nothing changed", async () => {
    await shop([{ messages: 4, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    const steps: boolean[] = [];
    for (let guard = 0; guard < 20; guard += 1) {
      const result = await runConversationSearchIndexStep(ports());
      if ("skipped" in result) throw new Error("unexpected skip");
      steps.push(result.changed);
      if (!result.changed) break;
    }
    expect(steps.at(-1)).toBe(false);
    // the drain indexes the messages and, in the same write, covers the conversation: nothing is left for the backfill
    expect(steps.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(await count("ConversationSearchDirty")).toBe(0);
    expect(await count("ConversationSearchDoc", `"kind"='M'`)).toBe(4);
    expect(await count("ConversationSearchDoc", `"kind"='C'`)).toBe(1);
  });
});

describe("an idle tick on a finished index", () => {
  it("opens no write transaction when nothing is queued and nothing is left to cover", async () => {
    await shop([{ messages: 3, lastMessageAt: "2026-10-20T10:00:00Z" }]);
    await forgetQueue();
    for (let round = 0; round < 10; round += 1) {
      const step = await runConversationSearchIndexStep(ports());
      if ("skipped" in step || !step.changed) break;
    }
    let transactions = 0;
    const counting: IndexerClient = {
      $queryRawUnsafe: (query, ...values) => db.$queryRawUnsafe(query, ...values),
      $executeRawUnsafe: (query, ...values) => db.$executeRawUnsafe(query, ...values),
      $transaction: (run, options) => {
        transactions += 1;
        return db.$transaction((tx) => run(tx as unknown as SqlClient), options);
      },
    };

    expect(await drainConversationSearchDirty(ports({ client: counting }))).toEqual({
      indexed: 0,
      removed: 0,
      stale: 0,
      failed: 0,
      cleared: 0,
      covered: 0,
      remaining: 0,
    });
    expect(await runConversationSearchIndexStep(ports({ client: counting }))).toEqual({ changed: false });
    expect(transactions).toBe(0);
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
const expectedContact = (name: string | null, phone: string | null, conversationId: string) =>
  hashedSorted(contactStrings(name, phone), conversationId);
const renameContact = (id: string, contactName: string) => db.conversation.update({ where: { id }, data: { contactName } });
const OLD_NAME = "Zorbaxel Quillon";
const NEW_NAME = "Mirvanth Delcora";

describe("contact tokens on the C doc", () => {
  it("carries the salted tokens of the folded name, the folded phone and the compact forms, none equal to a message token", async () => {
    const { conversationIds } = await shop([
      { messages: 2, lastMessageAt: "2026-10-20T10:00:00Z", name: "Amine Ben Ali", phone: "+213 555 12 34 56" },
    ]);
    const id = conversationIds[0]!;
    await db.message.create({
      data: { conversationId: id, body: seal("Amine Ben Ali +213 555 12 34 56"), direction: "inbound", timestamp: new Date() },
    });
    await forgetQueue();
    await backfillAll();
    const tokens = await tokensOfDoc("C", id);
    expect(tokens.length).toBeGreaterThan(30);
    expect(tokens).toEqual(await expectedContact("Amine Ben Ali", "+213 555 12 34 56", id));
    // same words in a message of the same conversation: other numbers (the prefixes differ)
    const message = (await rows<{ entityId: string }>(`SELECT "entityId" FROM "ConversationSearchDoc" WHERE "kind"='M' LIMIT 1`))[0]!;
    const shared = (await tokensOfDoc("M", message.entityId)).filter((hash) => tokens.includes(hash));
    expect(shared).toEqual([]);
  });

  it("the backfill writes nothing for the C doc when the contact changed after it was read, and covers the new contact next", async () => {
    const { conversationIds } = await shop([{ messages: 2, lastMessageAt: "2026-10-20T10:00:00Z", name: OLD_NAME, phone: null }]);
    const id = conversationIds[0]!;
    await forgetQueue();
    const first = await backfillConversationSearchChunk(ports({ beforeWrite: async () => void (await renameContact(id, NEW_NAME)) }));
    expect(first).toMatchObject({ indexed: 2, covered: 0 });
    expect(await docOf("C", id)).toHaveLength(0);
    const second = await backfillConversationSearchChunk(ports());
    expect(second).toMatchObject({ covered: 1 });
    expect(await tokensOfDoc("C", id)).toEqual(await expectedContact(NEW_NAME, null, id));
  });

  it("a contact rename drops the old tokens at once and the drain writes the new ones (old name no longer matches, new does)", async () => {
    const { conversationIds } = await shop([{ messages: 3, lastMessageAt: "2026-10-20T10:00:00Z", name: OLD_NAME, phone: "0555 11 22 33" }]);
    const id = conversationIds[0]!;
    for (let guard = 0; guard < 20; guard += 1) {
      const step = await runConversationSearchIndexStep(ports());
      if ("skipped" in step || !step.changed) break;
    }
    expect(await tokensOfDoc("C", id)).toEqual(await expectedContact(OLD_NAME, "0555 11 22 33", id));

    await renameContact(id, NEW_NAME);
    expect(await docOf("C", id)).toHaveLength(0);
    expect(await tokensOfDoc("C", id)).toEqual([]);
    expect(await count("ConversationSearchDirty", `"kind"='C'`)).toBe(1);

    expect(await drainConversationSearchDirty(ports())).toMatchObject({ covered: 1 });
    const now = await tokensOfDoc("C", id);
    expect(now).toEqual(await expectedContact(NEW_NAME, "0555 11 22 33", id));
    const oldOnly = (await hashedSorted(contactStrings(OLD_NAME, null), id)).filter(
      (hash) => !now.includes(hash),
    );
    expect(oldOnly.length).toBeGreaterThan(20); // the two names share no piece, so every old name token is gone
    const newNameTokens = await hashedSorted(contactStrings(NEW_NAME, null), id);
    expect(newNameTokens.every((hash) => now.includes(hash))).toBe(true);
    expect(await count("ConversationSearchDirty", `"kind"='C'`)).toBe(0);
  });

  it("the drain leaves a conversation uncovered while a message has neither an M doc nor a Dirty row, and the backfill covers it", async () => {
    const { conversationIds } = await shop([{ messages: 2, lastMessageAt: "2026-10-20T10:00:00Z", name: OLD_NAME }]);
    await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchDirty" WHERE "kind" = 'M'`);
    expect(await drainConversationSearchDirty(ports())).toMatchObject({ covered: 0, cleared: 1 });
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(0);
    expect(await count("ConversationSearchDirty")).toBe(0);
    await backfillAll();
    expect(await count("ConversationSearchDoc", `"kind"='M'`)).toBe(2);
    expect((await tokensOfDoc("C", conversationIds[0]!)).length).toBeGreaterThan(10);
  });

  it("the drain writes nothing for the C doc when the contact changed after it was read", async () => {
    const { conversationIds } = await shop([{ messages: 0, lastMessageAt: "2026-10-20T10:00:00Z", name: OLD_NAME }]);
    const id = conversationIds[0]!;
    const result = await drainConversationSearchDirty(ports({ beforeWrite: async () => void (await renameContact(id, NEW_NAME)) }));
    expect(result).toMatchObject({ covered: 0 });
    expect(await docOf("C", id)).toHaveLength(0);
    await backfillAll();
    const phone = (await db.conversation.findUniqueOrThrow({ where: { id } })).contactPhone;
    expect(await tokensOfDoc("C", id)).toEqual(await expectedContact(NEW_NAME, phone, id));
  });

  it("writes no tokens for a missing name or phone and does not throw", async () => {
    const { conversationIds } = await shop([
      { messages: 0, lastMessageAt: "2026-10-20T10:00:00Z" },
      { messages: 0, lastMessageAt: "2026-10-21T10:00:00Z", name: "Karim", phone: null },
    ]);
    const [bare, nameOnly] = conversationIds as [string, string];
    const noContact = ports({ openContact: async () => ({ name: null, phone: null }) });
    expect(await drainConversationSearchDirty(noContact)).toMatchObject({ covered: 2, cleared: 2 });
    expect(await docOf("C", bare)).toHaveLength(1);
    expect(await tokensOfDoc("C", bare)).toEqual([]);

    await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchToken"`);
    await db.$executeRawUnsafe(`DELETE FROM "ConversationSearchDoc"`);
    await db.$executeRawUnsafe(`INSERT INTO "ConversationSearchDirty" ("kind","entityId","conversationId") VALUES ('C', ?, ?)`, nameOnly, nameOnly);
    expect(await drainConversationSearchDirty(ports({ openContact: async () => ({ name: "Karim", phone: null }) }))).toMatchObject({ covered: 1 });
    expect(await tokensOfDoc("C", nameOnly)).toEqual(await expectedContact("Karim", null, nameOnly));
  });

  it("a contact that cannot be opened leaves the conversation uncovered, throws nothing and blocks nobody", async () => {
    const { conversationIds } = await shop([
      { messages: 1, lastMessageAt: "2026-10-22T10:00:00Z", name: "Brisé" },
      { messages: 1, lastMessageAt: "2026-10-21T10:00:00Z", name: "Intact" },
    ]);
    const picky = ports({
      openContact: async (contact) => {
        if (contact.contactName === "Brisé") throw new Error("not sealed");
        return openContact(contact);
      },
    });
    for (let guard = 0; guard < 10; guard += 1) {
      const step = await runConversationSearchIndexStep(picky);
      if ("skipped" in step || !step.changed) break;
    }
    expect(await docOf("C", conversationIds[0]!)).toHaveLength(0);
    expect(await docOf("C", conversationIds[1]!)).toHaveLength(1);
    expect(await count("ConversationSearchDirty", `"kind"='C'`)).toBe(0);
    expect(await docOf("M", (await rows<{ id: string }>(`SELECT "id" FROM "Message" WHERE "conversationId"=?`, conversationIds[0]!))[0]!.id)).toHaveLength(1);
  });
});
